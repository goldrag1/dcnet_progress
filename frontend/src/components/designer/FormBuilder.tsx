import { useEffect, useRef, useState } from "react";
import {
  Button, Input, InputNumber, Switch, Tag, Typography, Popconfirm,
  Space, Empty, Select,
} from "antd";
import {
  ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined,
  EditOutlined, CheckOutlined,
} from "@ant-design/icons";
import type { FormField } from "../../api/types";
import { vnSlug } from "../../utils/slug";

const { Text } = Typography;

const TYPE_LABELS: Record<string, string> = {
  text: "Văn bản",
  textarea: "Đoạn văn",
  number: "Số",
  date: "Ngày tháng",
  select: "Lựa chọn",
  checkbox: "Hộp kiểm",
  link: "Liên kết",
};

const TYPE_COLORS: Record<string, string> = {
  text: "blue",
  textarea: "cyan",
  number: "green",
  date: "orange",
  select: "purple",
  checkbox: "magenta",
  link: "geekblue",
};

interface FormBuilderProps {
  value?: string;
  onChange?: (json: string) => void;
  disabled?: boolean;
}

export default function FormBuilder({ value, onChange, disabled }: FormBuilderProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [keyEditing, setKeyEditing] = useState<Record<number, boolean>>({});
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Parse value from parent
  useEffect(() => {
    try {
      const parsed = JSON.parse(value || "[]");
      if (Array.isArray(parsed)) setFields(parsed);
    } catch {
      setFields([]);
    }
  }, [value]);

  // Emit changes
  function emit(updated: FormField[]) {
    setFields(updated);
    onChange?.(JSON.stringify(updated));
  }

  function updateField(idx: number, patch: Partial<FormField>) {
    const updated = fields.map((f, i) => i === idx ? { ...f, ...patch } : f);
    emit(updated);
  }

  function removeField(idx: number) {
    const updated = fields.filter((_, i) => i !== idx);
    if (expandedIdx === idx) setExpandedIdx(null);
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
    emit(updated);
  }

  function moveField(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const updated = [...fields];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    if (expandedIdx === idx) setExpandedIdx(target);
    else if (expandedIdx === target) setExpandedIdx(idx);
    emit(updated);
  }

  function handleLabelChange(idx: number, newLabel: string) {
    const f = fields[idx];
    const patch: Partial<FormField> = { label: newLabel };
    // Auto-generate key only if key was auto-generated (matches slug pattern)
    const currentSlug = vnSlug(f.label);
    if (!f.key || f.key === currentSlug || f.key.startsWith("field_")) {
      patch.key = vnSlug(newLabel) || f.key;
    }
    updateField(idx, patch);
  }

  function isKeyDuplicate(key: string, currentIdx: number): boolean {
    return fields.some((f, i) => i !== currentIdx && f.key === key);
  }

  // Focus label input when a new field is expanded
  useEffect(() => {
    if (expandedIdx !== null && labelInputRef.current) {
      setTimeout(() => labelInputRef.current?.focus(), 50);
    }
  }, [expandedIdx]);

  if (fields.length === 0 && !disabled) {
    return (
      <Empty
        description="Chưa có trường nào"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ margin: "32px 0" }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Nhấn vào loại trường bên phải để thêm
        </Text>
      </Empty>
    );
  }

  if (fields.length === 0 && disabled) {
    return (
      <Empty
        description="Bước này không có biểu mẫu"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ margin: "32px 0" }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {fields.map((field, idx) => {
        const isExpanded = expandedIdx === idx;
        const dupKey = isKeyDuplicate(field.key, idx);

        return (
          <div
            key={`${field.key}-${idx}`}
            style={{
              border: isExpanded ? "1px solid #1677ff" : "1px solid #e8e8e8",
              borderRadius: 6,
              background: isExpanded ? "#fafbff" : "#fff",
              transition: "all 0.15s",
            }}
          >
            {/* Header row */}
            <div
              onClick={() => !disabled && setExpandedIdx(isExpanded ? null : idx)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", cursor: disabled ? "default" : "pointer",
              }}
            >
              <Text style={{ fontSize: 12, color: "#999", minWidth: 20 }}>{idx + 1}.</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{field.label}</Text>
              <Tag color={TYPE_COLORS[field.type]} style={{ fontSize: 11, margin: 0 }}>
                {TYPE_LABELS[field.type] || field.type}
              </Tag>
              {field.required && (
                <Text style={{ color: "#ff4d4f", fontSize: 11, fontWeight: 600 }}>*</Text>
              )}
              {!disabled && (
                <Space.Compact size="small" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    onClick={() => moveField(idx, -1)}
                    disabled={idx === 0}
                  />
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    onClick={() => moveField(idx, 1)}
                    disabled={idx === fields.length - 1}
                  />
                  <Popconfirm
                    title="Xóa trường này?"
                    onConfirm={() => removeField(idx)}
                    okText="Xóa"
                    cancelText="Hủy"
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space.Compact>
              )}
            </div>

            {/* Property editor (expanded) */}
            {isExpanded && !disabled && (
              <div style={{ padding: "0 12px 12px", borderTop: "1px solid #f0f0f0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginTop: 10 }}>
                  {/* Label */}
                  <div>
                    <Text style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 2 }}>Nhãn</Text>
                    <Input
                      ref={labelInputRef as never}
                      size="small"
                      value={field.label}
                      onChange={(e) => handleLabelChange(idx, e.target.value)}
                    />
                  </div>

                  {/* Key */}
                  <div>
                    <Text style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 2 }}>Key</Text>
                    <Input
                      size="small"
                      value={field.key}
                      onChange={(e) => updateField(idx, { key: e.target.value })}
                      status={dupKey ? "error" : undefined}
                      addonAfter={
                        keyEditing[idx] ? (
                          <CheckOutlined
                            style={{ cursor: "pointer", color: "#52c41a" }}
                            onClick={() => setKeyEditing((prev) => ({ ...prev, [idx]: false }))}
                          />
                        ) : (
                          <EditOutlined
                            style={{ cursor: "pointer" }}
                            onClick={() => setKeyEditing((prev) => ({ ...prev, [idx]: true }))}
                          />
                        )
                      }
                      disabled={!keyEditing[idx]}
                    />
                    {dupKey && <Text type="danger" style={{ fontSize: 11 }}>Key trùng lặp</Text>}
                  </div>

                  {/* Required */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Space>
                      <Text style={{ fontSize: 12 }}>Bắt buộc</Text>
                      <Switch
                        size="small"
                        checked={!!field.required}
                        onChange={(checked) => updateField(idx, { required: checked })}
                      />
                    </Space>
                  </div>
                </div>

                {/* Type-specific config */}
                {field.type === "select" && (
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>
                      Danh sách lựa chọn
                    </Text>
                    <Select
                      mode="tags"
                      size="small"
                      style={{ width: "100%" }}
                      value={field.options || []}
                      onChange={(vals) => updateField(idx, { options: vals })}
                      placeholder="Nhập và Enter để thêm lựa chọn"
                      tokenSeparators={[","]}
                      open={false}
                    />
                  </div>
                )}

                {field.type === "link" && (
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>
                      DocType liên kết
                    </Text>
                    <Input
                      size="small"
                      value={field.link_doctype || ""}
                      onChange={(e) => updateField(idx, { link_doctype: e.target.value })}
                      placeholder="Vd: Employee, Customer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Export a helper to add a field and get updated JSON + new index
export function addFieldToSchema(
  currentJson: string | undefined,
  fieldType: string
): { json: string; newIndex: number } {
  let existing: FormField[] = [];
  try {
    existing = JSON.parse(currentJson || "[]");
  } catch {
    existing = [];
  }
  const idx = existing.length;
  const key = `field_${idx + 1}`;
  const newField: FormField = {
    key,
    label: `Trường ${idx + 1}`,
    type: fieldType as FormField["type"],
    required: false,
  };
  if (fieldType === "select") {
    newField.options = [];
  }
  const updated = [...existing, newField];
  return { json: JSON.stringify(updated), newIndex: idx };
}
