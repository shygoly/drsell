import { MailService } from './mail.service';
import { renderExpiryNotice } from './expiry-notice.template';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

const params = {
  to: 'owner@test.com',
  shopDomain: 'a.myshopify.com',
  planCode: 'basic',
  periodEnd: new Date('2026-09-12T00:00:00.000Z'),
  daysLeft: 3,
};

function svcWith(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const prisma = { mailSubscriber: { findUnique: jest.fn().mockResolvedValue(null) } };
  return { svc: new MailService(prisma as never), prisma };
}

const CLEAR = {
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_USER: undefined,
  SMTP_PASS: undefined,
  MAIL_FROM: undefined,
};

describe('出站邮件通道', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(CLEAR)) delete process.env[k];
  });
  afterAll(() => {
    for (const k of Object.keys(CLEAR)) delete process.env[k];
  });

  it('未配置时抛错，不静默丢弃——这是 sendDunning 犯过的错的反面', async () => {
    const { svc } = svcWith(CLEAR);
    expect(svc.outboundConfigured()).toBe(false);
    await expect(svc.sendExpiryNotice(params)).rejects.toThrow(
      /outbound email channel is not configured/,
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('只配了 SMTP_HOST 没配 MAIL_FROM 也算未配置，不发半截信', async () => {
    const { svc } = svcWith({ ...CLEAR, SMTP_HOST: 'smtp.test' });
    expect(svc.outboundConfigured()).toBe(false);
    await expect(svc.sendExpiryNotice(params)).rejects.toThrow(/not configured/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('配齐后真的发出，收件人与正文正确', async () => {
    const { svc } = svcWith({
      ...CLEAR,
      SMTP_HOST: 'smtp.test',
      MAIL_FROM: 'Drsell <no-reply@szchada.top>',
    });
    expect(svc.outboundConfigured()).toBe(true);
    await svc.sendExpiryNotice(params);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0][0];
    expect(sent.to).toBe('owner@test.com');
    expect(sent.from).toBe('Drsell <no-reply@szchada.top>');
    expect(sent.subject).toContain('3 天后到期');
    expect(sent.text).toContain('a.myshopify.com');
  });

  it('已退订的商家不再打扰，且失败原因可追', async () => {
    const { svc, prisma } = svcWith({
      ...CLEAR,
      SMTP_HOST: 'smtp.test',
      MAIL_FROM: 'no-reply@szchada.top',
    });
    prisma.mailSubscriber.findUnique.mockResolvedValue({ status: 'unsubscribed' });
    await expect(svc.sendExpiryNotice(params)).rejects.toThrow(/unsubscribed/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('端口 465 用隐式 TLS，587 用 STARTTLS——写死任一个都会在另一种端口上连不上', async () => {
    const { createTransport } = jest.requireMock('nodemailer') as {
      createTransport: jest.Mock;
    };
    const base = { ...CLEAR, SMTP_HOST: 'smtp.test', MAIL_FROM: 'a@b.c' };

    svcWith({ ...base, SMTP_PORT: '465' }).svc.outboundConfigured();
    await svcWith({ ...base, SMTP_PORT: '465' }).svc.sendExpiryNotice(params);
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: true }));

    await svcWith({ ...base, SMTP_PORT: '587' }).svc.sendExpiryNotice(params);
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: false }));
  });
});

describe('提醒正文', () => {
  it('发给商家，可以说清套餐与续费入口（顾客侧话术才必须回避）', () => {
    const { subject, text } = renderExpiryNotice(params);
    expect(subject).toContain('a.myshopify.com');
    expect(text).toContain('basic');
    expect(text).toContain('2026-09-12');
    expect(text).toContain('宽限');
    expect(text).toMatch(/Shopify 后台/);
  });
});
