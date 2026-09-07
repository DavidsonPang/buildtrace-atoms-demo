import { parse, serialize } from "parse5";

import type { GeneratedApp, ValidationCheck } from "@/src/lib/contracts";

export const CHANNEL_TOKEN_PLACEHOLDER = "__BUILDTRACE_CHANNEL_TOKEN__";
export const MAX_HTML_BYTES = 100_000;

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
};

const BLOCKED_TAGS = new Set([
  "iframe",
  "frame",
  "object",
  "embed",
  "base",
  "link",
]);

const URL_ATTRIBUTES = new Set([
  "src",
  "href",
  "action",
  "formaction",
  "poster",
]);

const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "media-src data: blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const bridge = `<script>(function(){const token="${CHANNEL_TOKEN_PLACEHOLDER}";const send=(type,payload={})=>parent.postMessage({source:"buildtrace-preview",token,type,payload},"*");window.addEventListener("error",event=>send("error",{message:String(event.message||"Runtime error")}));window.addEventListener("unhandledrejection",event=>send("error",{message:String(event.reason||"Unhandled promise rejection")}));document.addEventListener("click",event=>{if(event.target&&event.target.closest("button,a,input,select,textarea"))send("interaction",{kind:"click"})},true);document.addEventListener("input",()=>send("interaction",{kind:"input"}),true);if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>send("ready"),0),{once:true})}else{setTimeout(()=>send("ready"),0)}})();</script>`;

function walk(node: HtmlNode, visit: (current: HtmlNode) => void) {
  visit(node);
  node.childNodes?.forEach((child) => walk(child, visit));
}

function isExternalUrl(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^(https?:|\/\/|javascript:|data:text\/html)/.test(normalized);
}

export function validateAndInstrument(app: GeneratedApp): {
  acceptedHtml: string;
  checks: ValidationCheck[];
} {
  const checks: ValidationCheck[] = [];
  const failures: string[] = [];
  const byteLength = new TextEncoder().encode(app.html).byteLength;

  checks.push({
    id: "document-size",
    label: "文档大小",
    status: byteLength <= MAX_HTML_BYTES ? "pass" : "failure",
    detail: `${byteLength.toLocaleString()} / ${MAX_HTML_BYTES.toLocaleString()} bytes`,
  });

  if (byteLength > MAX_HTML_BYTES) failures.push("生成文档超过大小限制。");

  const parsedDocument = parse(app.html);
  const document = parsedDocument as unknown as HtmlNode;
  let bodyFound = false;
  let visibleText = "";
  let interactiveElement = false;

  walk(document, (node) => {
    if (node.tagName === "body") bodyFound = true;
    if (node.nodeName === "#text" && node.value)
      visibleText += ` ${node.value}`;
    if (
      ["button", "input", "select", "textarea"].includes(node.tagName ?? "")
    ) {
      interactiveElement = true;
    }
    if (node.tagName && BLOCKED_TAGS.has(node.tagName)) {
      failures.push(`禁止使用 <${node.tagName}>。`);
    }
    if (node.tagName === "meta") {
      const httpEquiv = node.attrs?.find((attr) => attr.name === "http-equiv");
      if (httpEquiv) failures.push("禁止生成自定义 http-equiv meta 标签。");
    }
    node.attrs?.forEach((attr) => {
      if (attr.name.startsWith("on") && node.tagName !== "script") {
        failures.push(`禁止使用内联事件属性 ${attr.name}。`);
      }
      if (URL_ATTRIBUTES.has(attr.name) && isExternalUrl(attr.value)) {
        failures.push(`禁止外部或危险 URL：${attr.name}。`);
      }
      if (attr.name === "target" && attr.value.toLowerCase() === "_top") {
        failures.push("禁止顶层窗口导航。");
      }
    });
  });

  const hasVisibleBody =
    bodyFound && visibleText.replace(/\s+/g, " ").trim().length >= 20;

  checks.push({
    id: "visible-body",
    label: "可见页面主体",
    status: hasVisibleBody ? "pass" : "failure",
    detail: hasVisibleBody
      ? "检测到可见主体内容。"
      : "页面缺少足够的可见内容。",
  });

  checks.push({
    id: "interaction-target",
    label: "有效交互",
    status: interactiveElement ? "pass" : "failure",
    detail: interactiveElement
      ? "检测到表单或按钮控件。"
      : "未检测到可交互控件。",
  });

  const policyPass = failures.length === 0;
  checks.push({
    id: "sandbox-policy",
    label: "沙箱安全策略",
    status: policyPass ? "pass" : "failure",
    detail: policyPass
      ? "未发现被禁止的标签、导航或远程依赖。"
      : failures.join(" "),
  });

  if (!hasVisibleBody) failures.push("缺少可见页面主体。");
  if (!interactiveElement) failures.push("缺少有效交互控件。");
  if (failures.length > 0) throw new SandboxValidationError(failures, checks);

  const normalized = serialize(parsedDocument);
  const securityMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  const acceptedHtml = normalized
    .replace("</head>", `${securityMeta}</head>`)
    .replace("</body>", `${bridge}</body>`);

  return { acceptedHtml, checks };
}

export class SandboxValidationError extends Error {
  constructor(
    public readonly reasons: string[],
    public readonly checks: ValidationCheck[],
  ) {
    super(reasons.join(" "));
    this.name = "SandboxValidationError";
  }
}
