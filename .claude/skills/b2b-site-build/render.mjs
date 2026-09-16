#!/usr/bin/env node
// b2b-site-build 生成器：把 clients/<slug>/ 的事实契约(catalog.json)+ 表达契约
// (sitecopy.json)+ 构建配置(site.config.json)实例化为一份可部署的静态站
// clients/<slug>/site/index.html。
//
// 架构（为什么这么做，别改）：
// - **样式单一来源**：CSS 从 apps/shop-web/index.html 的 <style> 原样抽取，不复制、
//   不改写——模板改主题，所有客户站跟着变。工厂拥有 runtime(CSS/JS)，客户拥有内容。
// - **产品不硬编码**（ADR-24）：产品区只发射骨架，运行时从 Medusa /store/products 拉，
//   规格读 metadata.specs/specsOrder。seed 见 seed.mjs。
// - **渗漏面清零**：模板里 Drsell 自家文案与承诺（title、48h 提示、品牌名）不在任何
//   区块里也会漏出去——本生成器不继承模板正文，逐区块从 sitecopy 发射，从源头杜绝。
//
// 用法：node render.mjs --client clients/kossel-medtech [--template apps/shop-web/index.html]
// 输出：<client>/site/index.html；随后跑 validate-build.mjs 断言无残留。

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []),
);
const clientDir = args.client;
if (!clientDir) { console.error('用法: node render.mjs --client clients/<slug>'); process.exit(2); }
const templatePath = args.template || 'apps/shop-web/index.html';

const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
const cat = readJson(path.join(clientDir, 'catalog.json'));
const sc = readJson(path.join(clientDir, 'sitecopy.json'));
const cfgPath = path.join(clientDir, 'site.config.json');
const cfg = fs.existsSync(cfgPath) ? readJson(cfgPath) : {};
const tpl = read(templatePath);

// ---- HTML 转义 ----
const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 抽取模板 <style>（单一样式来源）----
const styleMatch = tpl.match(/<style>[\s\S]*?<\/style>/);
if (!styleMatch) { console.error('✗ 模板里找不到 <style> 块'); process.exit(1); }
let style = styleMatch[0];
// 可选主题覆盖：site.config.json.theme = { "--primary": "#b3243b", ... }
if (cfg.theme && typeof cfg.theme === 'object') {
  for (const [k, v] of Object.entries(cfg.theme)) {
    const re = new RegExp(`(${k.replace(/[-]/g, '\\-')}\\s*:)[^;]*;`);
    if (re.test(style)) style = style.replace(re, `$1${v};`);
  }
}

// ---- 构建配置默认值 ----
const widgetShop = cfg.widget?.shopDomain || '__SHOP_DOMAIN__';       // 由 b2b-cs-attach 定，先占位
const widgetApiBase = cfg.widget?.apiBase || 'https://drsell.szchada.top/api';
const widgetScript = cfg.widget?.scriptSrc || 'https://drsell.szchada.top/drsell-chat.js';
const logoLetter = sc.brand_header?.logo_letter || (sc.footer?.company || 'K').slice(0, 1);

// ---- 区块发射器 ----
const secHead = (kicker, h2, sub) =>
  `<div class="sec-head">${kicker ? `<div class="kicker">${h(kicker)}</div>` : ''}<h2>${h(h2)}</h2>${sub ? `<p class="muted">${h(sub)}</p>` : ''}</div>`;

function navBlock() {
  const links = (sc.nav || []).map((n) => `<a href="${h(n.href)}">${h(n.label)}</a>`).join('\n        ');
  const bh = sc.brand_header || {};
  return `<header class="nav">
  <div class="nav-inner">
    <div class="brand"><span class="logo">${h(logoLetter)}</span> ${h(bh.brand_text || sc.footer?.company || '')} ${bh.brand_sub ? `<span style="color:var(--sub);font-weight:500;font-size:.85em">${h(bh.brand_sub)}</span>` : ''}</div>
    <nav class="links">
        ${links}
      <a class="cta" href="#inquiry">${h(sc.hero?.ctas?.[0]?.label || '询价')}</a>
    </nav>
  </div>
</header>`;
}

function heroBlock() {
  const hero = sc.hero || {};
  const ctas = (hero.ctas || []).map((c, i) => `<a class="btn ${i === 0 ? 'solid' : 'ghost'}" href="${h(c.href)}">${h(c.label)}</a>`).join('');
  // 侧卡：用最新里程碑/信任点。取前 3 条 stats 的 label 作信任芯片，避免另造事实。
  const chips = (hero.stats || []).slice(0, 4).map((s) => `<span>${h(s.value === 'auto' ? '' : s.value + ' ')}${h(s.label)}</span>`).join('');
  return `<section class="hero" style="padding-top:48px">
  <div class="wrap">
    <div>
      ${hero.kicker ? `<div class="badge">${h(hero.kicker)}</div>` : ''}
      <h1>${h(hero.h1)}</h1>
      <p class="lead">${h(hero.lead)}</p>
      <div class="hero-actions">${ctas}</div>
      <div class="trust">${chips}</div>
    </div>
    <div class="hero-note">
      <h3>${h(sc.inquiry?.h2 || '智能客服 + 人工报价')}</h3>
      <p class="muted">${h(sc.products_head?.sub || '产品按场景组织，采购与委托一律走询价对接。')}</p>
    </div>
  </div>
</section>`;
}

function statsBlock() {
  const stats = (sc.hero?.stats || []).map((s) => {
    const isAuto = s.value === 'auto';
    return `      <div class="stat"><b${isAuto ? ' id="statProducts"' : ''}>${isAuto ? '—' : h(s.value)}</b><span>${h(s.label)}</span></div>`;
  }).join('\n');
  return `<section style="padding-top:8px">
  <div class="wrap">
    <div class="stats">
${stats}
    </div>
  </div>
</section>`;
}

function productsBlock() {
  const ph = sc.products_head || {};
  // 交互网格仍运行时从 Medusa 拉（ADR-24：规格是后台可改的数据）；但 AI 检索抓取器不跑 JS，
  // 原始 HTML 里必须有产品事实才可能被引用（GEO 铁律）。故补一份 <noscript> 事实快照：
  // 有 JS 的人看交互网格，无 JS 的爬虫/agent 读这份原子化事实。快照来自 catalog.json（build 时），
  // 与 seed 同源；后台直接改规格后需重新 render 才同步——SEO 快照可接受的滞后。
  const seo = (cat.products || []).map((p) => {
    const m = p.metadata || {}; const specs = m.specs || {}; const order = m.specsOrder || Object.keys(specs);
    const rows = order.filter((k) => specs[k]).map((k) => `<dt>${h(k)}</dt><dd>${h(specs[k])}</dd>`).join('');
    return `      <article><h3>${h(p.title)}</h3><p>${h(p.description)}</p>${rows ? `<dl>${rows}</dl>` : ''}</article>`;
  }).join('\n');
  return `<section id="products">
  <div class="wrap">
    ${secHead(ph.kicker, ph.h2, ph.sub)}
    <div class="filter-bar" id="filters"></div>
    <div class="prod-grid" id="prodGrid"></div>
    <div class="loading-note" id="prodState">正在加载产品…</div>
    <noscript>
      <div class="seo-products">
${seo}
      </div>
    </noscript>
  </div>
</section>`;
}

function appsBlock() {
  const a = sc.apps || {};
  const cards = (a.cards || []).map((c) => `<div class="app">${h(c.name)}<small>${h(c.small)}</small></div>`).join('\n      ');
  return `<section id="apps" style="background:#EDF7F5">
  <div class="wrap">
    ${secHead(a.kicker, a.h2, a.sub)}
    <div class="app-grid">
      ${cards}
    </div>
  </div>
</section>`;
}

function credsBlock() {
  const c = sc.creds || {};
  const cards = (c.cards || []).map((k) => `<div class="cred"><div class="ic">${h(k.icon || '✔')}</div><h3>${h(k.title)}</h3><p>${h(k.text)}</p></div>`).join('\n      ');
  return `<section id="creds">
  <div class="wrap">
    ${secHead(c.kicker, c.h2, c.sub)}
    <div class="cred-grid">
      ${cards}
    </div>
  </div>
</section>`;
}

function servicesBlock() {
  const s = sc.services || {};
  const cards = (s.cards || []).map((k) => `<div class="svc"><h3>${h(k.title)}</h3><p>${h(k.text)}</p></div>`).join('\n      ');
  return `<section id="services" style="background:#EDF7F5">
  <div class="wrap">
    ${secHead(s.kicker, s.h2, s.sub)}
    <div class="svc-grid">
      ${cards}
    </div>
  </div>
</section>`;
}

function resourcesBlock() {
  const r = sc.resources || {};
  const items = (r.items || []).map((it) => {
    const planned = it.type === 'planned';
    const btn = planned ? '预约索取' : '索取';
    return `<li><span class="tt">${h(it.title)}</span><span class="dd">${h(it.meta || '')}</span><button type="button" onclick="requestDoc('${h(it.title).replace(/'/g, '')}')">${btn}</button></li>`;
  }).join('\n      ');
  return `<section id="resources">
  <div class="wrap">
    ${secHead(r.kicker, r.h2, r.sub)}
    <ul class="res-list">
      ${items}
    </ul>
  </div>
</section>`;
}

function faqBlock() {
  const items = (cat.faq || []).map((f, i) => `    <details class="faq"${i === 0 ? ' open' : ''}>
      <summary>${h(f.q)}</summary>
      <div class="body">${h(f.a)}</div>
    </details>`).join('\n');
  return `<section id="faq" style="background:#EDF7F5">
  <div class="wrap">
    ${secHead('常见采购问题 · FAQ', '常见采购问题（智能客服可直接应答）', '这些问答与右下角智能客服共用同一套知识，也可直接向客服提问。')}
${items}
  </div>
</section>`;
}

function inquiryBlock() {
  const inq = sc.inquiry || {};
  const tabs = inq.tabs || [];
  const tabBtns = tabs.map((t, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-role="${h(t.value)}" onclick="switchInq('${h(t.value)}')">${h(t.label)}</button>`).join('\n            ');
  const typeOpts = (inq.types || []).map((t) => `<option value="${h(t.value)}">${h(t.label)}</option>`).join('\n                ');
  const vol = inq.expected_volume;
  const volField = vol ? `<div class="field"><label>${h(vol.label)}</label><input type="text" id="f-volume" placeholder="${h(vol.placeholder || '')}" /></div>` : '';
  return `<section id="inquiry">
  <div class="wrap">
    ${secHead(inq.kicker, inq.h2, inq.sub)}
    <div class="inq-wrap">
      <div class="inq-card active" id="inq-card">
        <div class="tags">
            ${tabBtns}
        </div>
        <div class="body">
          <p id="inq-blurb">${h(tabs[0]?.body || '')}</p>
          <form id="inqForm" onsubmit="return submitInquiry(event)">
            <input type="hidden" id="f-role" value="${h(tabs[0]?.value || '')}" />
            <div class="field"><label>需求类型</label><select id="f-type">
                ${typeOpts}
            </select></div>
            <div class="field"><label class="req">联系人</label><input type="text" id="f-name" placeholder="姓名" /></div>
            <div class="field"><label>单位名称</label><input type="text" id="f-company" placeholder="${h(inq.company_placeholder || '单位名称')}" /></div>
            <div class="field"><label class="req">联系方式</label><input type="text" id="f-contact" placeholder="手机 / 邮箱 / 微信（至少填一项）" /></div>
            <div class="field"><label>所在地区</label><input type="text" id="f-region" placeholder="例：江苏苏州" /></div>
            <div class="field"><label>关注的产品 / 服务</label><select id="f-product"><option value="">（可稍后沟通）</option></select></div>
            ${volField}
            <div class="field"><label>应用器械 / 场景（简述）</label><textarea id="f-scene" placeholder="${h(inq.scene_placeholder || '')}"></textarea></div>
            <div class="field"><label>预计采购时间</label><select id="f-timeline">
              <option value="">（暂不确定）</option>
              <option value="immediate">1 个月内</option>
              <option value="quarter">1 个季度内</option>
              <option value="half_year">半年内</option>
              <option value="planning">仅前期了解</option>
            </select></div>
            <button class="btn submit" type="submit" id="f-submit">${h(inq.submit_label || '提交询价')}</button>
            <div class="form-msg" id="f-msg"></div>
          </form>
        </div>
      </div>
      <div class="inq-card">
        <h3>💬 智能客服已上线</h3>
        <p>右下角 <strong>AI 智能客服</strong>（站内 7×24）可自动应答产品、资质、采购流程问题；涉及价格、法规与定制需求时可转接人工。</p>
        <h4 style="margin-top:10px">📩 也可直接提交</h4>
        <p class="muted">本页询价表单提交后进入商城中台线索池，由对应负责人按需求类型跟进。</p>
      </div>
    </div>
  </div>
</section>`;
}

function footerBlock() {
  const f = sc.footer || {};
  const navLinks = (sc.nav || []).slice(0, 5).map((n) => `<a href="${h(n.href)}">${h(n.label)}</a>`).join('<br>');
  return `<footer>
  <div class="wrap">
    <div>
      <h5>${h(f.company)}</h5>
      <p>本站为内容式官网，产品与资质数据以最终商务确认为准。</p>
    </div>
    <div>
      <h5>导航</h5>
      <p>${navLinks}</p>
    </div>
    <div>
      <h5>联系</h5>
      <p>${f.address ? h(f.address) + '<br>' : ''}${f.phone ? '电话：' + h(f.phone) + '<br>' : ''}${f.email ? '邮箱：' + h(f.email) : ''}</p>
    </div>
    <div class="src">商品与线索由 Medusa 商城中台驱动；本页无构建、同源调用 Store API 渲染。价格与供货以询价对接为准。</div>
  </div>
</footer>`;
}

// ---- 通用 JS 运行时（工厂拥有；仅 toast/widget/tabs 随客户变）----
const tabBodies = JSON.stringify(Object.fromEntries((sc.inquiry?.tabs || []).map((t) => [t.value, t.body])));
const hasVolume = !!sc.inquiry?.expected_volume;
const successToast = sc.success_toast || '已收到您的询价，市场部将尽快与您联系。';

const js = `<script>
  var MEDUSA_PUBLISHABLE_KEY = "__PUBLISHABLE_KEY__";
  var MEDUSA_REGION_ID = "__REGION_ID__";
  var ALL_PRODUCTS = [], activeCat = "全部";
  var TAB_BODIES = ${tabBodies};
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];});}
  function parseMaybeJson(v){if(typeof v!=="string")return v;try{return JSON.parse(v);}catch(e){return null;}}
  function readSpecs(p){var m=p&&p.metadata;var s=parseMaybeJson(m&&m.specs);var order=parseMaybeJson(m&&m.specsOrder);if(s&&typeof s==="object"&&!Array.isArray(s)){if(Array.isArray(order)&&order.length){var sorted={};order.forEach(function(k){if(Object.prototype.hasOwnProperty.call(s,k))sorted[k]=s[k];});Object.keys(s).forEach(function(k){if(!Object.prototype.hasOwnProperty.call(sorted,k))sorted[k]=s[k];});return sorted;}return s;}return null;}
  function specHtml(p){var s=readSpecs(p);if(!s)return "";var rows="";for(var k in s)if(s.hasOwnProperty(k)){rows+="<dt>"+esc(k)+"</dt><dd>"+esc(s[k])+"</dd>";}return '<div class="spec"><dl>'+rows+"</dl></div>";}
  function prodCard(p){var cat=(p.categories&&p.categories[0]&&p.categories[0].name)||"未分类";var el=document.createElement("div");el.className="prod";el.setAttribute("data-cat",cat);el.innerHTML='<span class="tag">'+esc(cat)+"</span><h3>"+esc(p.title||"未命名产品")+"</h3>"+(p.subtitle?'<p class="sub">'+esc(p.subtitle)+"</p>":"")+'<p class="desc">'+esc((p.description||"").slice(0,120))+"</p>"+specHtml(p)+'<div class="prod-actions"><button type="button" class="primary" data-inq="'+esc(p.title)+'">索取报价</button><button type="button" data-doc="'+esc(p.title)+'">索取资料</button></div>';return el;}
  function renderFilters(cats){var box=document.getElementById("filters");box.innerHTML="";["全部"].concat(cats).forEach(function(c){var b=document.createElement("button");b.type="button";b.textContent=c;if(c===activeCat)b.className="active";b.onclick=function(){activeCat=c;renderProducts();};box.appendChild(b);});}
  function renderProducts(){var grid=document.getElementById("prodGrid");grid.innerHTML="";var list=ALL_PRODUCTS.filter(function(p){var cat=(p.categories&&p.categories[0]&&p.categories[0].name)||"未分类";return activeCat==="全部"||cat===activeCat;});list.forEach(function(p){grid.appendChild(prodCard(p));});document.getElementById("prodState").textContent=list.length?"":"该分类下暂无产品。";renderFilters(Array.from(new Set(ALL_PRODUCTS.map(function(p){return (p.categories&&p.categories[0]&&p.categories[0].name)||"未分类";}))));}
  (function loadProducts(){var state=document.getElementById("prodState");var url="/store/products?limit=100&region_id="+encodeURIComponent(MEDUSA_REGION_ID)+"&fields=title,handle,subtitle,description,metadata,*categories";fetch(url,{headers:{"x-publishable-api-key":MEDUSA_PUBLISHABLE_KEY}}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).then(function(d){ALL_PRODUCTS=(d&&d.products)||[];var sp=document.getElementById("statProducts");if(sp)sp.textContent=ALL_PRODUCTS.length||"—";renderProducts();fillProductSelect();}).catch(function(e){state.textContent="产品加载失败（"+e.message+"）。你仍可点击右下角客服或下方表单咨询。";});})();
  function fillProductSelect(){var sel=document.getElementById("f-product");if(!sel)return;ALL_PRODUCTS.forEach(function(p){var o=document.createElement("option");o.value=p.title;o.textContent=p.title;sel.appendChild(o);});}
  var role=document.getElementById("f-role").value;
  function switchInq(m){role=m;document.getElementById("f-role").value=m;var blurb=document.getElementById("inq-blurb");if(blurb&&TAB_BODIES[m])blurb.textContent=TAB_BODIES[m];document.querySelectorAll(".tags button").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-role")===m);});}
  function scrollToInquiry(type,product){var sec=document.getElementById("inquiry");if(sec)sec.scrollIntoView({behavior:"smooth"});if(type){var sel=document.getElementById("f-type");if(sel)sel.value=type;}if(product){var p=document.getElementById("f-product");if(p){var found=Array.prototype.some.call(p.options,function(o){return o.value===product;});if(found)p.value=product;}var scene=document.getElementById("f-scene");if(scene&&!scene.value)scene.placeholder="咨询产品："+product+"。请补充应用器械与年用量…";}}
  function requestDoc(name){scrollToInquiry("doc");var scene=document.getElementById("f-scene");if(scene)scene.value="资料索取："+name;}
  document.addEventListener("click",function(e){var t=e.target;if(!t||t.tagName!=="BUTTON")return;if(t.getAttribute("data-inq"))scrollToInquiry("purchase",t.getAttribute("data-inq"));else if(t.getAttribute("data-doc"))scrollToInquiry("doc",t.getAttribute("data-doc"));});
  function submitInquiry(ev){ev.preventDefault();var msg=document.getElementById("f-msg");var btn=document.getElementById("f-submit");var name=document.getElementById("f-name").value.trim();var contact=document.getElementById("f-contact").value.trim();var isEmail=/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(contact);msg.className="form-msg err";if(!name){msg.textContent="请填写联系人。";return false;}if(!contact){msg.textContent="请填写手机、邮箱或微信，否则无法跟进。";return false;}if(contact.indexOf("@")!==-1&&!isEmail){msg.textContent="邮箱格式不正确。";return false;}var vol=document.getElementById("f-volume");var payload={contactRole:role,inquiryType:document.getElementById("f-type").value,contactName:name,companyName:document.getElementById("f-company").value.trim()||undefined,contactEmail:isEmail?contact:undefined,contactPhone:isEmail?undefined:contact,region:document.getElementById("f-region").value.trim()||undefined,productsOfInterest:document.getElementById("f-product").value||undefined,expectedVolume:(vol&&vol.value.trim())||undefined,applicationScene:document.getElementById("f-scene").value.trim()||undefined,purchaseTimeline:document.getElementById("f-timeline").value||undefined};btn.disabled=true;msg.className="form-msg";msg.textContent="正在提交…";fetch("/store/inquiries",{method:"POST",headers:{"Content-Type":"application/json","x-publishable-api-key":MEDUSA_PUBLISHABLE_KEY},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(d){return {ok:r.ok,status:r.status,d:d};});}).then(function(res){if(res.ok&&res.d&&res.d.ok){msg.className="form-msg ok";msg.textContent=${JSON.stringify(successToast)};document.getElementById("inqForm").reset();document.getElementById("f-role").value=role;}else{msg.className="form-msg err";var why=(res.d&&(res.d.error||res.d.message))||("HTTP "+res.status);msg.textContent="提交失败："+why+"。也可直接点击右下角客服咨询。";}}).catch(function(){msg.className="form-msg err";msg.textContent="网络错误，请重试，或点击右下角客服咨询。";}).then(function(){btn.disabled=false;});return false;}
  document.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener("click",function(e){var id=a.getAttribute("href").slice(1);if(document.getElementById(id)){e.preventDefault();document.getElementById(id).scrollIntoView({behavior:"smooth"});}});});
</script>`;

const widget = `<div id="drsell-chat-root" data-shop="${h(widgetShop)}"></div>
<script>window.DRSELL_API_BASE = ${JSON.stringify(widgetApiBase)};</script>
<script src="${h(widgetScript)}" defer></script>`;

// ---- GEO/AEO：结构化数据 + 语义 meta + robots/sitemap/llms（依据 clients/_research/geo-aeo-*）----
// 站点公网域：从构建配置取；未回填时用占位（校验器会提醒）。
const domain = (cfg.site?.publicDomain || widgetShop || '__DOMAIN__').replace(/^https?:\/\//, '').replace(/\/$/, '');
const baseUrl = `https://${domain}`;
const orgName = sc.footer?.company || cat.brand?.name || domain;
const orgDesc = (cat.brand?.positioning || sc.seo?.description || '').split(/[。.]/)[0].slice(0, 300);
const buildDate = new Date().toISOString().slice(0, 19); // YYYY-MM-DDThh:mm:ss（百度时间因子/schema 日期共用）

// JSON-LD @graph：Organization + WebSite + 每产品 Product(叠加 MedicalDevice 语义) + BreadcrumbList + FAQPage。
// 值全部来自契约，不硬编码。MedicalDevice 是 MedicalEntity 子类、非 Product——故用 additionalType 叠加，不替换。
const graph = [
  { '@type': 'Organization', '@id': `${baseUrl}/#org`, name: orgName, url: `${baseUrl}/`, description: orgDesc },
  { '@type': 'WebSite', '@id': `${baseUrl}/#website`, url: `${baseUrl}/`, name: orgName, publisher: { '@id': `${baseUrl}/#org` }, datePublished: buildDate, dateModified: buildDate },
  ...(cat.products || []).map((p) => {
    const m = p.metadata || {}; const specs = m.specs || {}; const order = m.specsOrder || Object.keys(specs);
    const specLine = order.filter((k) => specs[k]).map((k) => `${k}：${specs[k]}`).join('；');
    return {
      '@type': 'Product', '@id': `${baseUrl}/#product-${p.handle}`,
      additionalType: 'https://schema.org/MedicalDevice',
      name: p.title, sku: p.handle,
      description: `${p.description || ''}${specLine ? `\n规格：${specLine}` : ''}`,
      category: (cat.categories || []).find((c) => c.id === p.category)?.name || undefined,
      brand: { '@type': 'Brand', name: (orgName.split(/\s|（/)[0]) || orgName },
      manufacturer: { '@id': `${baseUrl}/#org` },
    };
  }),
  { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首页', item: `${baseUrl}/` },
    { '@type': 'ListItem', position: 2, name: sc.products_head?.h2 || '产品中心' },
  ] },
  ...((cat.faq || []).length ? [{ '@type': 'FAQPage', mainEntity: (cat.faq || []).map((f) => ({
    '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a },
  })) }] : []),
];
const jsonLd = `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)}\n</script>`;

// 中文 delta（依据 references/geo-china.md）：百度落地页时间因子——百度官方明说「仅支持 JSON-LD」，
// 是其收录/排序依据，用独立于 schema.org 的 cambrian 词表。公司/产品/供求页正是适用页型。
// appid 需百度站长注册后回填；pubDate/upDate 从构建时间烘焙（首建两者相同）。
const baiduTimeFactor = `<script type="application/ld+json">
${JSON.stringify({ '@context': { '@vocab': 'https://ziyuan.baidu.com/contexts/cambrian.jsonld' }, '@id': `${baseUrl}/`, title: sc.seo?.title || orgName, pubDate: buildDate, upDate: buildDate }, null, 2)}
</script>`;

const metaHead = [
  `<meta name="robots" content="index,follow">`,
  `<link rel="canonical" href="${h(baseUrl)}/">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${h(sc.seo?.title)}">`,
  `<meta property="og:description" content="${h(sc.seo?.description)}">`,
  `<meta property="og:url" content="${h(baseUrl)}/">`,
].join('\n');

// robots.txt：默认放行搜索/检索类 AI bot（被抓是被引的前提）+ 指向 sitemap（研究结论）。
const robotsTxt = `# 搜索/检索类 AI bot——默认放行以获得引用（GEO 研究结论）
User-agent: Googlebot
User-agent: Bingbot
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Google-Extended
# 中文检索底座（喂文心/Qwen/智谱/豆包 等；见 references/geo-china.md）
User-agent: Baiduspider
User-agent: YisouSpider
User-agent: Sogou web spider
User-agent: Bytespider
Allow: /

# 训练类 bot——有 IP 顾虑的客户可把下面两行的 Allow 改成拒绝
User-agent: GPTBot
User-agent: ClaudeBot
Allow: /

User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><changefreq>weekly</changefreq></url>
</urlset>
`;
// llms.txt：近零成本默认产物（研究：消费端≈0，别当卖点）；只放同源锚点、无指令形状文本（防注入）。
const llmsTxt = `# ${orgName}
> ${orgDesc}

## 主要板块（同源）
- [产品中心](${baseUrl}/#products): 按临床场景组织的产品与规格
- [资质认证](${baseUrl}/#creds): 可溯源的认证与注册信息
- [采购 FAQ](${baseUrl}/#faq): 常见采购问题
- [询价](${baseUrl}/#inquiry): 按身份分流的询价入口
`;

// ---- 组装 ----
const out = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(sc.seo?.title)}</title>
<meta name="description" content="${h(sc.seo?.description)}">
${metaHead}
${style}
${jsonLd}
${baiduTimeFactor}
</head>
<body>

${navBlock()}

<main>
${heroBlock()}

${statsBlock()}

${productsBlock()}

${appsBlock()}

${credsBlock()}

${servicesBlock()}

${resourcesBlock()}

${faqBlock()}

${inquiryBlock()}
</main>

${footerBlock()}

${js}

<!-- Drsell AI 智能客服挂件。data-shop 必须等于 drsell 侧该店 Shop.shopDomain（由 b2b-cs-attach 建档并回填）。 -->
${widget}
</body>
</html>
`;

const outDir = path.join(clientDir, 'site');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'index.html');
fs.writeFileSync(outPath, out);
fs.writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt);
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapXml);
fs.writeFileSync(path.join(outDir, 'llms.txt'), llmsTxt);
console.log(`✓ 生成 ${outPath}（${(out.length / 1024).toFixed(1)} KB）+ robots.txt + sitemap.xml + llms.txt`);
console.log(`  GEO：JSON-LD @graph ${graph.length} 节点（含 ${(cat.products || []).length} Product）+ <noscript> 产品事实快照（AI 爬虫无需 JS 即可读）`);
console.log(`  域名 = ${domain}${domain.includes('__') ? '（占位，回填 site.config.site.publicDomain 或 widget.shopDomain）' : ''}；widget data-shop = ${widgetShop}`);
