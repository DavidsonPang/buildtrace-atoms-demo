export type VirtualSourceFile = {
  name: "index.html" | "styles.css" | "app.js";
  language: "HTML" | "CSS" | "JavaScript";
  content: string;
};

export function splitSelfContainedHtml(html: string): VirtualSourceFile[] {
  const styles: string[] = [];
  const scripts: string[] = [];

  let indexHtml = html.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_match, content: string) => {
      styles.push(content.trim());
      return styles.length === 1
        ? '<link rel="stylesheet" href="./styles.css">'
        : "";
    },
  );
  indexHtml = indexHtml.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    (_match, content: string) => {
      scripts.push(content.trim());
      return scripts.length === 1 ? '<script src="./app.js"></script>' : "";
    },
  );

  return [
    {
      name: "index.html",
      language: "HTML",
      content: formatHtmlForReading(indexHtml),
    },
    {
      name: "styles.css",
      language: "CSS",
      content: joinSections(styles, "CSS"),
    },
    {
      name: "app.js",
      language: "JavaScript",
      content: joinSections(scripts, "JavaScript"),
    },
  ];
}

function joinSections(sections: string[], language: string) {
  if (!sections.length) return `/* 该版本没有内联 ${language}。 */`;
  if (sections.length === 1) return sections[0];
  return sections
    .map((section, index) => `/* source block ${index + 1} */\n${section}`)
    .join("\n\n");
}

function formatHtmlForReading(html: string) {
  return html.replace(/>\s*</g, ">\n<").trim();
}
