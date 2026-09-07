import {
  GeneratedAppSchema,
  ProductAgentOutputSchema,
  TechnicalPlanSchema,
  type GeneratedApp,
  type ProductAgentOutput,
  type TechnicalPlan,
} from "@/src/lib/contracts";

type Scenario = "quote" | "event" | "roi";

function scenarioFor(prompt: string): Scenario {
  const text = prompt.toLowerCase();
  if (
    text.includes("活动") ||
    text.includes("event") ||
    text.includes("waitlist")
  ) {
    return "event";
  }
  if (text.includes("roi") || text.includes("saas") || text.includes("定价")) {
    return "roi";
  }
  return "quote";
}

export function createProductArtifacts(prompt: string): ProductAgentOutput {
  const scenario = scenarioFor(prompt);
  const outputs: Record<Scenario, ProductAgentOutput> = {
    quote: {
      ideaAnalysis: {
        problem:
          "自由职业者需要快速给出透明、一致的项目报价，但手工计算容易遗漏加急和附加服务成本。",
        audience:
          "需要在首次沟通后快速向客户提供报价的自由职业设计师与开发者。",
        assumptions: [
          "报价基于工时、时薪、加急程度和附加服务计算。",
          "首版只生成报价摘要，不处理真实支付与合同签署。",
        ],
        risks: [
          "过多字段会降低首次使用效率。",
          "价格建议不能替代用户自己的商业判断。",
        ],
      },
      productBrief: {
        productName: "SwiftQuote",
        valueProposition:
          "在一分钟内生成清晰、可解释、可复制给客户的项目报价。",
        primaryUser: "需要快速响应客户询价的自由职业设计师与开发者。",
        primaryAction: "选择服务并输入工时、时薪和交付要求，立即得到分项报价。",
        functionalRequirements: [
          "R1：选择项目服务类型并设置预计工时与时薪。",
          "R2：选择标准或加急交付并计算价格系数。",
          "R3：勾选附加服务并显示分项费用。",
          "R4：生成总价、交付时间和可复制报价摘要。",
        ],
        acceptanceCriteria: [
          "A1：任一输入变化都会即时更新总价。",
          "A2：总价等于基础费用、加急费用和附加服务之和。",
          "A3：复制操作提供明确成功反馈。",
        ],
        constraints: ["单页自包含应用。", "不依赖外部 API 或远程资源。"],
        outOfScope: ["在线支付。", "合同签署。", "客户账号。"],
      },
    },
    event: {
      ideaAnalysis: {
        problem: "小型活动组织者需要在报名、满额和候补之间快速维护清晰状态。",
        audience: "管理人数有限的工作坊、课程或社区活动的小型组织者。",
        assumptions: ["默认活动容量为 30 人。", "数据仅在当前页面会话中维护。"],
        risks: ["姓名重复可能造成歧义。", "首版不发送报名通知。"],
      },
      productBrief: {
        productName: "SeatFlow",
        valueProposition: "用一个清晰看板管理活动报名、剩余名额和候补队列。",
        primaryUser: "需要现场或远程维护活动名单的小型活动组织者。",
        primaryAction: "添加报名者，并让系统根据容量自动分配已确认或候补状态。",
        functionalRequirements: [
          "R1：添加报名者姓名。",
          "R2：满额后自动进入候补队列。",
          "R3：显示已确认、候补和剩余名额。",
          "R4：按全部、已确认和候补筛选名单。",
        ],
        acceptanceCriteria: [
          "A1：容量未满时新用户状态为已确认。",
          "A2：容量为零时新用户状态为候补。",
          "A3：筛选后的列表与统计保持一致。",
        ],
        constraints: ["单页自包含应用。", "不发送真实邮件。"],
        outOfScope: ["登录。", "在线付款。", "跨设备同步。"],
      },
    },
    roi: {
      ideaAnalysis: {
        problem: "SaaS 购买者难以把抽象的效率提升转化为可比较的财务回报。",
        audience: "需要向团队说明软件采购价值的小型 SaaS 创业者和业务负责人。",
        assumptions: ["按每月四周计算节省时间。", "推荐依据净收益和团队规模。"],
        risks: ["估算结果取决于用户输入。", "结果不构成财务建议。"],
      },
      productBrief: {
        productName: "ValuePilot",
        valueProposition:
          "把团队节省的时间换算成月度价值，并给出可解释的套餐建议。",
        primaryUser: "正在比较 SaaS 采购成本与效率收益的团队负责人。",
        primaryAction:
          "输入团队规模、人力成本和每周节省时间，比较套餐与回本周期。",
        functionalRequirements: [
          "R1：输入团队人数、时薪和每人每周节省时间。",
          "R2：计算每月节省价值与净收益。",
          "R3：根据团队规模推荐套餐。",
          "R4：显示回报倍数和清晰 CTA。",
        ],
        acceptanceCriteria: [
          "A1：输入变化即时更新结果。",
          "A2：每月价值按人数×时薪×周节省时间×4 计算。",
          "A3：推荐套餐与人数区间一致。",
        ],
        constraints: ["单页自包含应用。", "结果明确标记为估算。"],
        outOfScope: ["真实订阅。", "税务计算。", "财务建议。"],
      },
    },
  };

  return ProductAgentOutputSchema.parse(outputs[scenario]);
}

export function createTechnicalPlan(prompt: string): TechnicalPlan {
  const scenario = scenarioFor(prompt);
  const common = {
    interactionModel:
      "使用表单输入驱动页面内状态，所有计算与列表变化即时反馈，并提供明确的结果区。",
    validationPlan: [
      "验证初始页面包含可见主体和主要表单。",
      "验证输入变化可以改变结果。",
      "验证移动宽度下不存在明显横向溢出。",
    ],
  };

  const plans: Record<Scenario, TechnicalPlan> = {
    quote: {
      ...common,
      dataModel: [
        {
          name: "QuoteInput",
          fields: ["service", "hours", "rate", "urgency", "extras"],
        },
        {
          name: "QuoteResult",
          fields: ["base", "rush", "extras", "total", "delivery"],
        },
      ],
      components: [
        {
          name: "QuoteForm",
          responsibility: "采集服务、工时、时薪和交付要求。",
        },
        {
          name: "QuoteSummary",
          responsibility: "显示分项费用、总价和复制反馈。",
        },
      ],
      behaviors: [
        "输入变化时重新计算报价。",
        "点击复制时写入剪贴板并展示成功状态。",
      ],
    },
    event: {
      ...common,
      dataModel: [
        { name: "Attendee", fields: ["id", "name", "status"] },
        { name: "Capacity", fields: ["limit", "confirmed", "remaining"] },
      ],
      components: [
        { name: "RegistrationForm", responsibility: "添加新的报名者。" },
        {
          name: "CapacityBoard",
          responsibility: "展示容量指标和筛选后的名单。",
        },
      ],
      behaviors: [
        "添加报名时按剩余容量分配状态。",
        "筛选按钮只显示对应报名者。",
      ],
    },
    roi: {
      ...common,
      dataModel: [
        { name: "RoiInput", fields: ["teamSize", "hourlyCost", "hoursSaved"] },
        { name: "Plan", fields: ["name", "price", "teamRange"] },
      ],
      components: [
        { name: "RoiForm", responsibility: "采集团队和效率参数。" },
        {
          name: "Recommendation",
          responsibility: "展示套餐、净收益和回报倍数。",
        },
      ],
      behaviors: ["滑块变化时重算月度价值。", "根据团队规模切换推荐套餐。"],
    },
  };

  return TechnicalPlanSchema.parse(plans[scenario]);
}

export function createGeneratedApp(prompt: string): GeneratedApp {
  const scenario = scenarioFor(prompt);
  const apps: Record<Scenario, GeneratedApp> = {
    quote: {
      title: "SwiftQuote 项目报价计算器",
      summary: "根据工时、时薪、加急程度和附加服务生成透明报价与客户摘要。",
      html: quoteHtml,
      implementedRequirementIds: ["R1", "R2", "R3", "R4"],
    },
    event: {
      title: "SeatFlow 活动容量看板",
      summary: "管理活动报名、剩余名额和候补状态的交互式运营工具。",
      html: eventHtml,
      implementedRequirementIds: ["R1", "R2", "R3", "R4"],
    },
    roi: {
      title: "ValuePilot SaaS ROI 计算器",
      summary: "把团队节省时间转化为月度收益，并给出可解释的套餐建议。",
      html: roiHtml,
      implementedRequirementIds: ["R1", "R2", "R3", "R4"],
    },
  };

  return GeneratedAppSchema.parse(apps[scenario]);
}

const sharedStyle = `
*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#17211b;font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}.shell{max-width:920px;margin:auto;padding:40px 22px 64px}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#55725f;font-weight:800}.title{font-size:clamp(32px,6vw,58px);line-height:1.02;letter-spacing:-.05em;margin:10px 0}.lede{color:#5f6d64;max-width:620px;font-size:17px}.grid{display:grid;grid-template-columns:1.08fr .92fr;gap:18px;margin-top:30px}.card{background:#fff;border:1px solid #dfe3dc;border-radius:20px;padding:22px;box-shadow:0 18px 50px rgba(25,42,31,.07)}label{display:block;font-size:12px;font-weight:800;margin:15px 0 7px;color:#506057}input,select{width:100%;border:1px solid #ccd3cc;border-radius:11px;padding:11px 12px;font:inherit;background:#fbfcfa;color:#17211b}input:focus,select:focus{outline:3px solid #d8f45b;border-color:#253c2c}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metric{padding:14px 0;border-bottom:1px solid #edf0eb;display:flex;justify-content:space-between;gap:20px}.metric strong{font-variant-numeric:tabular-nums}.total{font-size:38px;letter-spacing:-.04em;font-weight:850;margin:18px 0 4px}.muted{color:#6f7b73;font-size:13px}.button{border:0;border-radius:12px;padding:12px 16px;background:#173f2a;color:white;font-weight:800;cursor:pointer;width:100%;margin-top:18px}.button:hover{background:#22563a}.pill{display:inline-flex;background:#e5f56d;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800}.checks{display:grid;gap:9px;margin-top:8px}.check{display:flex;gap:8px;align-items:center}.check input{width:auto}@media(max-width:700px){.grid{grid-template-columns:1fr}.shell{padding-top:25px}.title{font-size:40px}}`;

const quoteHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SwiftQuote</title><style>${sharedStyle}</style></head><body><main class="shell"><div class="eyebrow">Freelance toolkit · 报价助手</div><h1 class="title">清楚报价，<br>更快开始合作。</h1><p class="lede">调整项目范围与交付节奏，即时得到透明报价和可发送给客户的摘要。</p><div class="grid"><section class="card"><span class="pill">项目参数</span><label for="service">服务类型</label><select id="service"><option value="1">品牌网站</option><option value=".75">落地页</option><option value="1.2">Web 应用</option></select><div class="row"><div><label for="hours">预计工时</label><input id="hours" type="number" min="1" value="36"></div><div><label for="rate">时薪（¥）</label><input id="rate" type="number" min="1" value="450"></div></div><label for="rush">交付节奏</label><select id="rush"><option value="1">标准 · 3 周</option><option value="1.25">加急 · 2 周（+25%）</option><option value="1.5">特急 · 1 周（+50%）</option></select><label>附加服务</label><div class="checks"><label class="check"><input class="extra" type="checkbox" value="1600"> 内容梳理（¥1,600）</label><label class="check"><input class="extra" type="checkbox" value="2400"> 响应式细化（¥2,400）</label></div></section><aside class="card"><span class="pill">即时估算</span><div class="total" id="total">¥0</div><p class="muted" id="delivery">预计 3 周交付</p><div class="metric"><span>基础费用</span><strong id="base">—</strong></div><div class="metric"><span>加急费用</span><strong id="rushFee">—</strong></div><div class="metric"><span>附加服务</span><strong id="extras">—</strong></div><button class="button" id="copy">复制客户报价摘要</button><p class="muted" id="feedback" aria-live="polite">报价仅供沟通，最终范围以合同为准。</p></aside></div></main><script>const q=s=>document.querySelector(s),money=n=>'¥'+Math.round(n).toLocaleString('zh-CN');function calc(){const base=+q('#hours').value*+q('#rate').value*+q('#service').value,rate=+q('#rush').value,rush=base*(rate-1),extras=[...document.querySelectorAll('.extra:checked')].reduce((s,x)=>s+(+x.value),0),total=base+rush+extras,weeks=rate===1?3:rate===1.25?2:1;q('#base').textContent=money(base);q('#rushFee').textContent=money(rush);q('#extras').textContent=money(extras);q('#total').textContent=money(total);q('#delivery').textContent='预计 '+weeks+' 周交付';return total}document.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',calc));q('#copy').onclick=async()=>{const text='项目报价：'+money(calc())+'，'+q('#delivery').textContent+'。';try{await navigator.clipboard.writeText(text);q('#feedback').textContent='已复制，可以直接发给客户。'}catch{q('#feedback').textContent=text}};calc();</script></body></html>`;

const eventHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SeatFlow</title><style>${sharedStyle}.list{display:grid;gap:8px;margin-top:16px}.person{display:flex;justify-content:space-between;padding:10px 12px;background:#f6f7f3;border-radius:10px}.filters{display:flex;gap:6px;margin-top:14px}.filters button{border:1px solid #ccd3cc;background:white;border-radius:999px;padding:7px 10px;cursor:pointer}.filters button.active{background:#173f2a;color:white}</style></head><body><main class="shell"><div class="eyebrow">Workshop ops · 容量管理</div><h1 class="title">SeatFlow</h1><p class="lede">让每一个报名状态都清楚可见，满额后自动进入候补。</p><div class="grid"><section class="card"><span class="pill">新增报名</span><label for="name">参与者姓名</label><input id="name" placeholder="例如：陈雨"><button class="button" id="add">添加报名</button><p class="muted" id="feedback" aria-live="polite">演示容量：30 人</p><div class="filters"><button data-filter="all" class="active">全部</button><button data-filter="confirmed">已确认</button><button data-filter="waitlist">候补</button></div><div class="list" id="list"></div></section><aside class="card"><span class="pill">实时容量</span><div class="total"><span id="remaining">27</span> 席</div><p class="muted">当前剩余名额</p><div class="metric"><span>已确认</span><strong id="confirmed">3</strong></div><div class="metric"><span>候补</span><strong id="waiting">0</strong></div></aside></div></main><script>let people=['林夏','周然','Alex'].map((name,i)=>({id:i,name,status:'confirmed'})),filter='all';const q=s=>document.querySelector(s);function render(){const confirmed=people.filter(x=>x.status==='confirmed').length,waiting=people.length-confirmed;q('#confirmed').textContent=confirmed;q('#waiting').textContent=waiting;q('#remaining').textContent=Math.max(0,30-confirmed);q('#list').innerHTML=people.filter(x=>filter==='all'||x.status===filter).map(x=>'<div class="person"><span>'+x.name+'</span><strong>'+(x.status==='confirmed'?'已确认':'候补')+'</strong></div>').join('')}q('#add').onclick=()=>{const name=q('#name').value.trim();if(!name){q('#feedback').textContent='请先输入姓名。';return}const status=people.filter(x=>x.status==='confirmed').length<30?'confirmed':'waitlist';people.push({id:Date.now(),name,status});q('#name').value='';q('#feedback').textContent=name+' 已'+(status==='confirmed'?'确认报名。':'加入候补。');render()};document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render()});render();</script></body></html>`;

const roiHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ValuePilot</title><style>${sharedStyle}input[type=range]{padding:0;accent-color:#173f2a}.big{font-size:52px;font-weight:850;letter-spacing:-.05em}</style></head><body><main class="shell"><div class="eyebrow">SaaS decision tool · ROI</div><h1 class="title">把效率，换算成<br>看得见的价值。</h1><p class="lede">用团队规模与节省时间估算月度回报，快速判断适合的套餐。</p><div class="grid"><section class="card"><span class="pill">团队参数</span><label for="team">团队人数：<strong id="teamValue">8</strong></label><input id="team" type="range" min="1" max="50" value="8"><label for="cost">平均时薪（¥）</label><input id="cost" type="number" min="1" value="180"><label for="saved">每人每周节省小时</label><input id="saved" type="number" min="0" step=".5" value="3"></section><aside class="card"><span class="pill" id="plan">推荐 Growth 套餐</span><p class="muted" style="margin-top:20px">预计每月净节省</p><div class="big" id="net">¥0</div><div class="metric"><span>时间价值</span><strong id="value">—</strong></div><div class="metric"><span>套餐成本</span><strong id="price">—</strong></div><div class="metric"><span>投资回报</span><strong id="multiple">—</strong></div><button class="button">开始 14 天试用</button><p class="muted">结果为估算，不构成财务建议。</p></aside></div></main><script>const q=s=>document.querySelector(s),money=n=>'¥'+Math.round(n).toLocaleString('zh-CN');function calc(){const team=+q('#team').value,cost=+q('#cost').value,saved=+q('#saved').value,value=team*cost*saved*4,price=team<=5?299:team<=20?699:1299,name=team<=5?'Starter':team<=20?'Growth':'Scale';q('#teamValue').textContent=team;q('#plan').textContent='推荐 '+name+' 套餐';q('#value').textContent=money(value);q('#price').textContent=money(price);q('#net').textContent=money(Math.max(0,value-price));q('#multiple').textContent=(value/price).toFixed(1)+'×'}document.querySelectorAll('input').forEach(x=>x.addEventListener('input',calc));calc();</script></body></html>`;
