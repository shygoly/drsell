'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Page,
  ResourceItem,
  ResourceList,
  Spinner,
  Text,
} from '@shopify/polaris';
import { apiFetch } from '@/lib/api';
import { useShopSession } from '@/hooks/useShopSession';
import { useTranslations } from '@/components/AppProviders';

type ConversationStatus = 'ai' | 'pending' | 'human';

type Conversation = {
  id: string;
  customer: string;
  avatarInitials: string;
  topic: string;
  preview: string;
  status: ConversationStatus;
  channel: string;
  time: string;
  unread?: number;
};

type TranscriptMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type BadgeTone = React.ComponentProps<typeof Badge>['tone'];

const STATUS_TONE: Record<ConversationStatus, BadgeTone> = {
  ai: 'success',
  pending: 'attention',
  human: 'info',
};

function InboxInner() {
  const t = useTranslations();
  const { shop, token, ready } = useShopSession();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);

  const load = useCallback(async () => {
    if (!shop || !token) return;
    setFailed(false);
    try {
      const rows = await apiFetch<Conversation[]>(
        '/storefront/conversations',
        { token },
      );
      setConversations(rows);
    } catch {
      setConversations(null);
      setFailed(true);
    }
  }, [shop, token]);

  useEffect(() => {
    if (ready && shop && token) void load();
  }, [ready, shop, token, load]);

  const openThread = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setTranscript(null);
      if (!shop || !token) return;
      try {
        const rows = await apiFetch<TranscriptMessage[]>(
          `/storefront/inbox/${encodeURIComponent(id)}/messages`,
          { token },
        );
        setTranscript(rows);
      } catch {
        setTranscript([]);
      }
    },
    [shop, token],
  );

  if (!ready || (!conversations && !failed)) {
    return (
      <Page title={t('inbox.title')}>
        <InlineStack gap="200" blockAlign="center">
          <Spinner accessibilityLabel={t('inbox.loading')} size="small" />
          <Text as="p" tone="subdued">
            {t('inbox.loading')}
          </Text>
        </InlineStack>
      </Page>
    );
  }

  if (failed) {
    return (
      <Page title={t('inbox.title')}>
        <BlockStack gap="300">
          <Text as="p" tone="critical">
            {t('inbox.error')}
          </Text>
          <Box>
            <Button onClick={() => void load()}>{t('inbox.retry')}</Button>
          </Box>
        </BlockStack>
      </Page>
    );
  }

  const rows = conversations ?? [];

  if (rows.length === 0) {
    return (
      <Page title={t('inbox.title')} subtitle={t('inbox.subtitle')}>
        <Card>
          <EmptyState heading={t('inbox.emptyTitle')} image="">
            <p>{t('inbox.emptyBody')}</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page title={t('inbox.title')} subtitle={t('inbox.subtitle')}>
      <BlockStack gap="400">
        <Card padding="0">
          <ResourceList
            resourceName={{ singular: 'conversation', plural: 'conversations' }}
            items={rows}
            renderItem={(c) => (
              <ResourceItem
                id={c.id}
                accessibilityLabel={c.customer}
                onClick={() => void openThread(c.id)}
              >
                <InlineStack align="space-between" blockAlign="start" gap="300">
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">
                      {c.customer}
                    </Text>
                    <Text as="span" tone="subdued">
                      {c.preview || c.topic}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={STATUS_TONE[c.status]}>
                      {t(`inbox.status.${c.status}`)}
                    </Badge>
                    <Text as="span" tone="subdued">
                      {c.time}
                    </Text>
                  </InlineStack>
                </InlineStack>
              </ResourceItem>
            )}
          />
        </Card>

        {selectedId ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                {t('inbox.transcript')}
              </Text>
              {transcript === null ? (
                <Spinner accessibilityLabel={t('inbox.loading')} size="small" />
              ) : (
                transcript.map((m) => (
                  <BlockStack key={m.id} gap="050">
                    <Text as="span" tone="subdued" variant="bodySm">
                      {m.role === 'user' ? t('inbox.roleUser') : t('inbox.roleAssistant')}
                    </Text>
                    <Text as="p">{m.content}</Text>
                  </BlockStack>
                ))
              )}
            </BlockStack>
          </Card>
        ) : (
          <Text as="p" tone="subdued">
            {t('inbox.selectHint')}
          </Text>
        )}
      </BlockStack>
    </Page>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <InboxInner />
    </Suspense>
  );
}
