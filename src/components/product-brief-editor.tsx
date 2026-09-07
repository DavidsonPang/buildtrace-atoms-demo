"use client";

import { useState } from "react";

import {
  ProductAgentOutputSchema,
  type ProductAgentOutput,
} from "@/src/lib/contracts";

type ProductBriefEditorProps = {
  product: ProductAgentOutput;
  onCancel: () => void;
  onSave: (product: ProductAgentOutput) => void;
};

export function ProductBriefEditor({
  product,
  onCancel,
  onSave,
}: ProductBriefEditorProps) {
  const [valueProposition, setValueProposition] = useState(
    product.productBrief.valueProposition,
  );
  const [primaryUser, setPrimaryUser] = useState(
    product.productBrief.primaryUser,
  );
  const [primaryAction, setPrimaryAction] = useState(
    product.productBrief.primaryAction,
  );
  const [requirements, setRequirements] = useState(
    product.productBrief.functionalRequirements.join("\n"),
  );
  const [constraints, setConstraints] = useState(
    product.productBrief.constraints.join("\n"),
  );
  const [error, setError] = useState("");

  const save = () => {
    const next = ProductAgentOutputSchema.safeParse({
      ...product,
      productBrief: {
        ...product.productBrief,
        valueProposition: valueProposition.trim(),
        primaryUser: primaryUser.trim(),
        primaryAction: primaryAction.trim(),
        functionalRequirements: lines(requirements),
        constraints: lines(constraints),
      },
    });

    if (!next.success) {
      setError("请保留至少两项功能要求，并完整填写价值、用户和核心操作。");
      return;
    }

    onSave(next.data);
  };

  return (
    <div className="brief-editor" aria-label="编辑 Product Brief">
      <label>
        价值主张
        <textarea
          maxLength={300}
          onChange={(event) => setValueProposition(event.target.value)}
          value={valueProposition}
        />
      </label>
      <label>
        核心用户
        <textarea
          maxLength={300}
          onChange={(event) => setPrimaryUser(event.target.value)}
          value={primaryUser}
        />
      </label>
      <label>
        核心操作
        <textarea
          maxLength={300}
          onChange={(event) => setPrimaryAction(event.target.value)}
          value={primaryAction}
        />
      </label>
      <label>
        功能要求（每行一项）
        <textarea
          maxLength={1_900}
          onChange={(event) => setRequirements(event.target.value)}
          value={requirements}
        />
      </label>
      <label>
        约束（每行一项）
        <textarea
          maxLength={1_900}
          onChange={(event) => setConstraints(event.target.value)}
          value={constraints}
        />
      </label>
      {error ? <p className="brief-editor-error">{error}</p> : null}
      <div className="brief-editor-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          取消
        </button>
        <button className="build-button" onClick={save} type="button">
          保存修订
        </button>
      </div>
    </div>
  );
}

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}
