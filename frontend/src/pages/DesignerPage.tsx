import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button, Dropdown, Form, Input, Select, Space, Spin, Switch, Tabs,
  Tag, Typography, message, Tooltip, Empty, Divider,
} from "antd";
import {
  SaveOutlined, CheckCircleOutlined, PlusOutlined,
  ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined,
  AppstoreOutlined, BranchesOutlined, LayoutOutlined,
} from "@ant-design/icons";
import {
  ReactFlow, Controls, MiniMap, Background,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node, type NodeTypes,
  Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getDefinition, saveDefinition, publishDefinition, getTemplates } from "../api/client";
import type { ProcessStep, ProcessTransition, ProcessDefinition } from "../api/types";
import TemplatePickerModal from "../components/designer/TemplatePickerModal";
import BranchingModal from "../components/designer/BranchingModal";

const { Text } = Typography;

// ---- Step type config ----
const STEP_TYPES: { key: ProcessStep["step_type"]; label: string; color: string; icon: string }[] = [
  { key: "Start", label: "Bắt đầu", color: "#52c41a", icon: "▶" },
  { key: "Task", label: "Nhiệm vụ", color: "#1677ff", icon: "☑" },
  { key: "Approval", label: "Phê duyệt", color: "#fa8c16", icon: "◆" },
  { key: "Fork", label: "Chia nhánh", color: "#722ed1", icon: "⑃" },
  { key: "Join", label: "Gộp nhánh", color: "#531dab", icon: "⑄" },
  { key: "End", label: "Kết thúc", color: "#ff4d4f", icon: "⏹" },
];
const STEP_CONFIG: Record<string, { label: string; color: string; icon: string }> = Object.fromEntries(
  STEP_TYPES.map((s) => [s.key, s])
);

// ---- Field palette ----
const FIELD_TYPES = [
  { type: "text", label: "Văn bản" },
  { type: "textarea", label: "Đoạn văn" },
  { type: "number", label: "Số" },
  { type: "date", label: "Ngày tháng" },
  { type: "select", label: "Lựa chọn" },
  { type: "checkbox", label: "Hộp kiểm" },
  { type: "link", label: "Liên kết" },
];

// ---- ReactFlow nodes for flowchart tab ----
function FlowNode({ data, color }: { data: { label: string }; color: string }) {
  return (
    <div style={{ background: color, color: "#fff", borderRadius: 8, padding: "8px 16px", minWidth: 100, textAlign: "center", fontSize: 13 }}>
      <Handle type="target" position={Position.Top} />
      {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const makeNode = (color: string) => ({ data }: { data: { label: string } }) => <FlowNode data={data} color={color} />;
const nodeTypes: NodeTypes = {
  Start: makeNode("#52c41a"),
  Task: makeNode("#1677ff"),
  Approval: makeNode("#fa8c16"),
  Fork: makeNode("#722ed1"),
  Join: makeNode("#531dab"),
  End: makeNode("#ff4d4f"),
};

// ---- ID generator ----
let _counter = 0;
function genId(prefix: string) { return `${prefix}_${++_counter}_${Date.now()}`; }

// ---- Serialization helpers ----
function stepsToNodes(steps: ProcessStep[]): Node[] {
  return steps.map((s, i) => ({
    id: s.step_id,
    type: s.step_type,
    position: { x: 100 + i * 200, y: 150 },
    data: { label: s.label },
  }));
}
function transitionsToEdges(transitions: ProcessTransition[]): Edge[] {
  return transitions.map((t, i) => ({
    id: `e${i}-${t.from_step}-${t.to_step}`,
    source: t.from_step,
    target: t.to_step,
    label: t.label ?? "",
  }));
}

export default function DesignerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("Quy trình mới");
  const [definitionName, setDefinitionName] = useState<string | undefined>(id === "new" ? undefined : id);
  const [status, setStatus] = useState<ProcessDefinition["status"]>("Draft");

  // Steps state
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [transitions, setTransitions] = useState<ProcessTransition[]>([]);
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge(c, eds)),
    [setEdges]
  );

  // Modals
  const [templateModal, setTemplateModal] = useState(false);
  const [branchModal, setBranchModal] = useState(false);

  // Step config form
  const [configForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState("phanCong");

  // Load definition
  useEffect(() => {
    if (!id || id === "new") return;
    setLoading(true);
    getDefinition(id)
      .then((def) => {
        setTitle(def.title);
        setDefinitionName(def.name);
        setStatus(def.status);
        const parsedSteps: ProcessStep[] = def.steps_json ? JSON.parse(def.steps_json) : [];
        const parsedTrans: ProcessTransition[] = def.transitions_json ? JSON.parse(def.transitions_json) : [];
        setSteps(parsedSteps);
        setTransitions(parsedTrans);
        setNodes(stepsToNodes(parsedSteps));
        setEdges(transitionsToEdges(parsedTrans));
      })
      .catch(() => messageApi.error("Không thể tải quy trình"))
      .finally(() => setLoading(false));
  }, [id]);

  // Sync selected step to form
  useEffect(() => {
    if (selectedStep) {
      configForm.setFieldsValue({
        label: selectedStep.label,
        assigned_role: selectedStep.assigned_role,
        assigned_user: selectedStep.assigned_user,
        assigned_department: selectedStep.assigned_department,
        approval_mode: selectedStep.approval_mode ?? "Any",
        deadline_type: selectedStep.deadline_type ?? "None",
        deadline_hours: selectedStep.deadline_hours,
        deadline_field: selectedStep.deadline_field,
        no_return: selectedStep.no_return === 1,
        auto_complete: selectedStep.auto_complete === 1,
        email_enabled: selectedStep.email_enabled === 1,
        email_template: selectedStep.email_template,
        display_fields: selectedStep.display_fields,
        form_schema: selectedStep.form_schema,
      });
    }
  }, [selectedStep?.step_id]);

  // Update step from form
  function applyStepConfig() {
    if (!selectedStep) return;
    const vals = configForm.getFieldsValue();
    const updated: ProcessStep = {
      ...selectedStep,
      label: vals.label,
      assigned_role: vals.assigned_role,
      assigned_user: vals.assigned_user,
      assigned_department: vals.assigned_department,
      approval_mode: vals.approval_mode,
      deadline_type: vals.deadline_type,
      deadline_hours: vals.deadline_hours,
      deadline_field: vals.deadline_field,
      no_return: vals.no_return ? 1 : 0,
      auto_complete: vals.auto_complete ? 1 : 0,
      email_enabled: vals.email_enabled ? 1 : 0,
      email_template: vals.email_template,
      display_fields: vals.display_fields,
      form_schema: vals.form_schema,
    };
    setSteps((prev) => prev.map((s) => s.step_id === selectedStep.step_id ? updated : s));
    setSelectedStep(updated);
  }

  // Step list operations
  function addStep(stepType: ProcessStep["step_type"]) {
    const cfg = STEP_CONFIG[stepType];
    const newStep: ProcessStep = {
      step_id: genId(stepType.toLowerCase()),
      step_type: stepType,
      label: cfg.label,
      step_order: steps.length,
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStep(newStep);
  }

  function deleteStep(step_id: string) {
    setSteps((prev) => prev.filter((s) => s.step_id !== step_id));
    setTransitions((prev) => prev.filter((t) => t.from_step !== step_id && t.to_step !== step_id));
    if (selectedStep?.step_id === step_id) setSelectedStep(null);
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const newSteps = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= newSteps.length) return;
    [newSteps[idx], newSteps[target]] = [newSteps[target], newSteps[idx]];
    setSteps(newSteps.map((s, i) => ({ ...s, step_order: i })));
  }

  // Save
  async function handleSave() {
    if (selectedStep) applyStepConfig();
    setSaving(true);
    try {
      const saved = await saveDefinition({
        name: definitionName,
        title,
        steps_json: JSON.stringify(steps),
        transitions_json: JSON.stringify(transitions),
      });
      setDefinitionName(saved.name);
      setStatus(saved.status as ProcessDefinition["status"]);
      navigate(`/designer/${saved.name}`, { replace: true });
      messageApi.success("Đã lưu nháp");
    } catch {
      messageApi.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!definitionName) { await handleSave(); return; }
    setSaving(true);
    try {
      await publishDefinition(definitionName);
      setStatus("Published");
      messageApi.success("Đã xuất bản quy trình");
    } catch {
      messageApi.error("Xuất bản thất bại");
    } finally {
      setSaving(false);
    }
  }

  // Add field to form_schema of selected step
  function addFieldToForm(fieldType: string) {
    if (!selectedStep) { messageApi.info("Chọn một bước trước"); return; }
    const existing: { key: string; label: string; type: string }[] = (() => {
      try { return JSON.parse(selectedStep.form_schema ?? "[]"); } catch { return []; }
    })();
    const key = `field_${existing.length + 1}`;
    const newField = { key, label: `Trường ${existing.length + 1}`, type: fieldType, required: false };
    const updated = { ...selectedStep, form_schema: JSON.stringify([...existing, newField]) };
    setSteps((prev) => prev.map((s) => s.step_id === selectedStep.step_id ? updated : s));
    setSelectedStep(updated);
    configForm.setFieldValue("form_schema", updated.form_schema);
    setActiveTab("bieuMau");
  }

  if (loading) return <Spin style={{ margin: "80px auto", display: "block" }} />;

  const statusColor = status === "Published" ? "green" : status === "Draft" ? "blue" : "orange";
  const statusLabel = status === "Published" ? "Đã xuất bản" : status === "Draft" ? "Nháp" : "Tạm dừng";

  const addMenuItems = STEP_TYPES.filter((s) => s.key !== "Start").map((s) => ({
    key: s.key,
    label: `${s.icon} ${s.label}`,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      {contextHolder}

      {/* Toolbar */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 12, background: "#fff", flexShrink: 0 }}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: 280, fontWeight: 600 }}
          placeholder="Tên quy trình"
        />
        <Tag color={statusColor}>{statusLabel}</Tag>
        <div style={{ flex: 1 }} />
        <Space>
          <Button size="small" icon={<LayoutOutlined />} onClick={() => setTemplateModal(true)}>Mẫu</Button>
          <Button size="small" icon={<BranchesOutlined />} onClick={() => setBranchModal(true)} disabled={!selectedStep}>Phân nhánh</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>Lưu nháp</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={handlePublish} loading={saving} disabled={status === "Published"}>Xuất bản</Button>
        </Space>
      </div>

      {/* Main area */}
      <Tabs
        defaultActiveKey="design"
        style={{ flex: 1, overflow: "hidden" }}
        tabBarStyle={{ paddingLeft: 16, marginBottom: 0 }}
        items={[
          {
            key: "design",
            label: "Thiết kế",
            children: (
              <div style={{ display: "flex", height: "calc(100vh - 128px)", overflow: "hidden" }}>
                {/* Left: Step list */}
                <div style={{ width: 280, borderRight: "1px solid #f0f0f0", display: "flex", flexDirection: "column", background: "#fafafa", flexShrink: 0, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text strong style={{ fontSize: 13 }}>Các bước ({steps.length})</Text>
                    <Dropdown menu={{ items: addMenuItems, onClick: ({ key }) => addStep(key as ProcessStep["step_type"]) }}>
                      <Button size="small" type="primary" icon={<PlusOutlined />}>Thêm</Button>
                    </Dropdown>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
                    {steps.length === 0 && (
                      <Empty description="Chưa có bước nào" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
                    )}
                    {steps.map((step, idx) => {
                      const cfg = STEP_CONFIG[step.step_type] ?? { color: "#666", icon: "?", label: step.step_type };
                      const isSelected = selectedStep?.step_id === step.step_id;
                      return (
                        <div
                          key={step.step_id}
                          onClick={() => setSelectedStep(step)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 10px", borderRadius: 6, marginBottom: 4,
                            cursor: "pointer", background: isSelected ? "#e6f4ff" : "#fff",
                            border: isSelected ? "1px solid #1677ff" : "1px solid #e8e8e8",
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ width: 28, height: 28, borderRadius: 6, background: cfg.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                            {cfg.icon}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.label}</div>
                            <div style={{ fontSize: 11, color: "#888" }}>{cfg.label}{step.assigned_role ? ` · ${step.assigned_role}` : ""}</div>
                          </div>
                          <Space.Compact size="small" onClick={(e) => e.stopPropagation()}>
                            <Tooltip title="Lên"><Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveStep(idx, -1)} disabled={idx === 0} /></Tooltip>
                            <Tooltip title="Xuống"><Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} /></Tooltip>
                            <Tooltip title="Xóa"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteStep(step.step_id)} /></Tooltip>
                          </Space.Compact>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Center: Step config */}
                <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                  {!selectedStep ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#bbb", flexDirection: "column", gap: 8 }}>
                      <AppstoreOutlined style={{ fontSize: 48 }} />
                      <Text type="secondary">Chọn một bước để cấu hình</Text>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 32, height: 32, borderRadius: 6, background: STEP_CONFIG[selectedStep.step_type]?.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                          {STEP_CONFIG[selectedStep.step_type]?.icon}
                        </span>
                        <Text strong style={{ fontSize: 15 }}>{selectedStep.label}</Text>
                        <Tag>{STEP_CONFIG[selectedStep.step_type]?.label}</Tag>
                      </div>
                      <Form form={configForm} layout="vertical" onBlur={applyStepConfig}>
                        <Tabs
                          activeKey={activeTab}
                          onChange={setActiveTab}
                          size="small"
                          items={[
                            {
                              key: "phanCong",
                              label: "Phân công",
                              children: (
                                <div>
                                  <Form.Item name="label" label="Tên bước" rules={[{ required: true }]}>
                                    <Input />
                                  </Form.Item>
                                  <Form.Item name="assigned_role" label="Vai trò">
                                    <Input placeholder="Vd: Manager, Accountant" />
                                  </Form.Item>
                                  <Form.Item name="assigned_user" label="Người dùng">
                                    <Input placeholder="email@domain.com" />
                                  </Form.Item>
                                  <Form.Item name="assigned_department" label="Phòng ban">
                                    <Input placeholder="Tên phòng ban" />
                                  </Form.Item>
                                  {selectedStep.step_type === "Approval" && (
                                    <Form.Item name="approval_mode" label="Chế độ phê duyệt">
                                      <Select options={[
                                        { value: "Any", label: "Bất kỳ ai (Any)" },
                                        { value: "All", label: "Tất cả (All)" },
                                        { value: "Majority", label: "Đa số (Majority)" },
                                      ]} />
                                    </Form.Item>
                                  )}
                                </div>
                              ),
                            },
                            {
                              key: "bieuMau",
                              label: "Biểu mẫu",
                              children: (
                                <div>
                                  <Form.Item name="form_schema" label="Cấu hình trường (JSON)">
                                    <Input.TextArea rows={8} placeholder='[{"key":"amount","label":"Số tiền","type":"number","required":true}]' />
                                  </Form.Item>
                                  <Text type="secondary" style={{ fontSize: 12 }}>Kéo trường từ palette bên phải để thêm vào biểu mẫu.</Text>
                                </div>
                              ),
                            },
                            {
                              key: "hienThi",
                              label: "Hiển thị",
                              children: (
                                <Form.Item name="display_fields" label="Trường hiển thị (JSON)">
                                  <Input.TextArea rows={6} placeholder='["field_key_1","field_key_2"]' />
                                </Form.Item>
                              ),
                            },
                            {
                              key: "hanChot",
                              label: "Hạn chót",
                              children: (
                                <div>
                                  <Form.Item name="deadline_type" label="Loại hạn chót">
                                    <Select options={[
                                      { value: "None", label: "Không có" },
                                      { value: "Fixed Duration", label: "Thời lượng cố định" },
                                      { value: "From Field", label: "Từ trường dữ liệu" },
                                    ]} />
                                  </Form.Item>
                                  <Form.Item name="deadline_hours" label="Số giờ">
                                    <Input type="number" min={1} />
                                  </Form.Item>
                                  <Form.Item name="deadline_field" label="Trường ngày hạn">
                                    <Input placeholder="Tên trường (fieldname)" />
                                  </Form.Item>
                                </div>
                              ),
                            },
                            {
                              key: "nangCao",
                              label: "Nâng cao",
                              children: (
                                <div>
                                  <Form.Item name="no_return" label="Không cho phép trả về" valuePropName="checked">
                                    <Switch />
                                  </Form.Item>
                                  <Form.Item name="auto_complete" label="Tự động hoàn thành" valuePropName="checked">
                                    <Switch />
                                  </Form.Item>
                                  <Divider />
                                  <Form.Item name="email_enabled" label="Gửi email thông báo" valuePropName="checked">
                                    <Switch />
                                  </Form.Item>
                                  <Form.Item name="email_template" label="Template email">
                                    <Input placeholder="Tên template" />
                                  </Form.Item>
                                </div>
                              ),
                            },
                          ]}
                        />
                      </Form>
                    </div>
                  )}
                </div>

                {/* Right: Field palette */}
                <div style={{ width: 240, borderLeft: "1px solid #f0f0f0", background: "#fafafa", flexShrink: 0, overflow: "auto" }}>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
                    <Text strong style={{ fontSize: 13 }}>Palette trường</Text>
                  </div>
                  <div style={{ padding: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>Nhấn để thêm vào biểu mẫu của bước đang chọn</Text>
                    {FIELD_TYPES.map((ft) => (
                      <div
                        key={ft.type}
                        onClick={() => addFieldToForm(ft.type)}
                        style={{
                          padding: "6px 10px", borderRadius: 4, marginBottom: 4,
                          background: "#fff", border: "1px solid #e8e8e8", cursor: "pointer",
                          fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#1677ff")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e8e8e8")}
                      >
                        <PlusOutlined style={{ color: "#1677ff", fontSize: 11 }} />
                        {ft.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: "flowchart",
            label: "Sơ đồ",
            children: (
              <div style={{ height: "calc(100vh - 128px)" }}>
                <ReactFlow
                  nodes={steps.length > 0 ? stepsToNodes(steps) : nodes}
                  edges={transitions.length > 0 ? transitionsToEdges(transitions) : edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                >
                  <Controls />
                  <MiniMap />
                  <Background />
                </ReactFlow>
              </div>
            ),
          },
        ]}
      />

      <TemplatePickerModal
        open={templateModal}
        onClose={() => setTemplateModal(false)}
        onSelect={(def) => {
          if (def.steps_json) setSteps(JSON.parse(def.steps_json));
          if (def.transitions_json) setTransitions(JSON.parse(def.transitions_json));
          setTitle(def.title + " (bản sao)");
          setTemplateModal(false);
          messageApi.success("Đã áp dụng mẫu");
        }}
      />

      <BranchingModal
        open={branchModal}
        step={selectedStep}
        transitions={transitions}
        steps={steps}
        onClose={() => setBranchModal(false)}
        onSave={(newTransitions) => {
          setTransitions(newTransitions);
          setBranchModal(false);
          messageApi.success("Đã lưu phân nhánh");
        }}
      />
    </div>
  );
}
