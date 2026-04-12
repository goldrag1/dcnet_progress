import { useState } from "react";
import { Modal, Button, Select, Input, Space, Typography, Table, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ProcessStep, ProcessTransition } from "../../api/types";

const { Text } = Typography;

const OPERATORS = [
  { value: "==", label: "bằng (==)" },
  { value: "!=", label: "khác (!=)" },
  { value: ">", label: "lớn hơn (>)" },
  { value: "<", label: "nhỏ hơn (<)" },
  { value: ">=", label: "lớn hơn hoặc bằng (>=)" },
  { value: "<=", label: "nhỏ hơn hoặc bằng (<=)" },
];

const ACTION_TRIGGERS: { value: ProcessTransition["action_trigger"]; label: string }[] = [
  { value: "Send", label: "Gửi (Send)" },
  { value: "Approve", label: "Đồng ý (Approve)" },
  { value: "Reject", label: "Từ chối (Reject)" },
  { value: "Forward", label: "Chuyển tiếp (Forward)" },
  { value: "Return", label: "Trả về (Return)" },
];

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

function conditionRowsToExpr(rows: ConditionRow[]): string {
  if (!rows.length) return "";
  return rows.map((r) => `${r.field} ${r.operator} "${r.value}"`).join(" AND ");
}

interface Props {
  open: boolean;
  step: ProcessStep | null;
  transitions: ProcessTransition[];
  steps: ProcessStep[];
  onClose: () => void;
  onSave: (transitions: ProcessTransition[]) => void;
}

export default function BranchingModal({ open, step, transitions, steps, onClose, onSave }: Props) {
  const [rows, setRows] = useState<(ProcessTransition & { condRows: ConditionRow[] })[]>([]);

  // Init rows from transitions when opening
  function initRows() {
    if (!step) return;
    const fromStep = transitions
      .filter((t) => t.from_step === step.step_id)
      .map((t) => ({
        ...t,
        condRows: parseCondition(t.condition ?? ""),
      }));
    setRows(fromStep);
  }

  function parseCondition(expr: string): ConditionRow[] {
    if (!expr) return [];
    const parts = expr.split(" AND ").map((s) => s.trim());
    return parts.map((p) => {
      const match = p.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*"?(.*?)"?$/);
      if (match) return { field: match[1], operator: match[2], value: match[3] };
      return { field: p, operator: "==", value: "" };
    });
  }

  function addRow() {
    const toStep = steps.find((s) => s.step_id !== step?.step_id);
    setRows((prev) => [
      ...prev,
      {
        from_step: step?.step_id ?? "",
        to_step: toStep?.step_id ?? "",
        action_trigger: "Send",
        condition: "",
        label: "",
        condRows: [{ field: "", operator: "==", value: "" }],
      },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<typeof rows[0]>) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function updateCondRow(rowIdx: number, condIdx: number, patch: Partial<ConditionRow>) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const condRows = r.condRows.map((c, ci) => ci === condIdx ? { ...c, ...patch } : c);
      return { ...r, condRows, condition: conditionRowsToExpr(condRows) };
    }));
  }

  function addCondRow(rowIdx: number) {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const condRows = [...r.condRows, { field: "", operator: "==", value: "" }];
      return { ...r, condRows };
    }));
  }

  function handleSave() {
    if (!step) return;
    const otherTransitions = transitions.filter((t) => t.from_step !== step.step_id);
    const newTransitions = rows.map((r) => ({
      from_step: r.from_step,
      to_step: r.to_step,
      action_trigger: r.action_trigger,
      condition: r.condition,
      label: r.label,
    }));
    onSave([...otherTransitions, ...newTransitions]);
  }

  const otherSteps = steps.filter((s) => s.step_id !== step?.step_id);

  return (
    <Modal
      title={`Phân nhánh từ: ${step?.label ?? ""}`}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Lưu phân nhánh"
      cancelText="Hủy"
      width={700}
      afterOpenChange={(vis) => { if (vis) initRows(); }}
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Cấu hình các nhánh chuyển tiếp từ bước này. Điều kiện để xác định nhánh nào được kích hoạt.</Text>
      </div>

      {rows.map((row, idx) => (
        <div key={idx} style={{ border: "1px solid #e8e8e8", borderRadius: 6, padding: 12, marginBottom: 10, background: "#fafafa" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <Text strong style={{ fontSize: 12 }}>Nhánh {idx + 1}</Text>
            <Select
              size="small"
              style={{ width: 160 }}
              value={row.action_trigger}
              options={ACTION_TRIGGERS}
              onChange={(v) => updateRow(idx, { action_trigger: v })}
              placeholder="Khi nào"
            />
            <Text style={{ fontSize: 12 }}>→</Text>
            <Select
              size="small"
              style={{ width: 160 }}
              value={row.to_step}
              options={otherSteps.map((s) => ({ value: s.step_id, label: s.label }))}
              onChange={(v) => updateRow(idx, { to_step: v })}
              placeholder="Đến bước"
            />
            <Input
              size="small"
              style={{ flex: 1 }}
              placeholder="Nhãn nhánh"
              value={row.label}
              onChange={(e) => updateRow(idx, { label: e.target.value })}
            />
            <Popconfirm title="Xóa nhánh này?" onConfirm={() => removeRow(idx)} okText="Xóa" cancelText="Hủy">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </div>

          <div style={{ paddingLeft: 8 }}>
            <Text style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Điều kiện (Nếu … Thì kích hoạt nhánh này):</Text>
            {row.condRows.map((cond, ci) => (
              <Space key={ci} style={{ marginBottom: 4, display: "flex" }}>
                <Input
                  size="small"
                  style={{ width: 120 }}
                  placeholder="Tên trường"
                  value={cond.field}
                  onChange={(e) => updateCondRow(idx, ci, { field: e.target.value })}
                />
                <Select
                  size="small"
                  style={{ width: 100 }}
                  value={cond.operator}
                  options={OPERATORS}
                  onChange={(v) => updateCondRow(idx, ci, { operator: v })}
                />
                <Input
                  size="small"
                  style={{ width: 120 }}
                  placeholder="Giá trị"
                  value={cond.value}
                  onChange={(e) => updateCondRow(idx, ci, { value: e.target.value })}
                />
              </Space>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => addCondRow(idx)} style={{ marginTop: 4 }}>
              Thêm điều kiện
            </Button>
          </div>
        </div>
      ))}

      <Button icon={<PlusOutlined />} onClick={addRow} style={{ marginTop: 4 }}>
        Thêm nhánh
      </Button>
    </Modal>
  );
}
