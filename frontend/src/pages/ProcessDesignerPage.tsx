import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
  Dropdown,
} from "antd";
import {
  SaveOutlined,
  CheckCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  getDefinition,
  saveDefinition,
  publishDefinition,
} from "../api/client";
import type { ProcessStep, ProcessTransition } from "../api/types";

const { Title } = Typography;

// ---- Custom node components ----

function StartNode({ data }: { data: { label: string } }) {
  return (
    <div style={{ background: "#52c41a", color: "#fff", borderRadius: "50%", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
      <Handle type="source" position={Position.Bottom} />
      {data.label}
    </div>
  );
}

function TaskNode({ data }: { data: { label: string } }) {
  return (
    <div style={{ background: "#1677ff", color: "#fff", borderRadius: 8, padding: "8px 16px", minWidth: 100, textAlign: "center", fontSize: 13 }}>
      <Handle type="target" position={Position.Top} />
      {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ApprovalNode({ data }: { data: { label: string } }) {
  return (
    <div style={{ background: "#fa8c16", color: "#fff", borderRadius: 8, padding: "8px 16px", minWidth: 100, textAlign: "center", fontSize: 13, transform: "rotate(0deg)", border: "2px solid #d46b08" }}>
      <Handle type="target" position={Position.Top} />
      ◆ {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ForkNode({ data }: { data: { label: string } }) {
  return (
    <div style={{ background: "#722ed1", color: "#fff", borderRadius: 8, padding: "8px 16px", minWidth: 80, textAlign: "center", fontSize: 13 }}>
      <Handle type="target" position={Position.Top} />
      ⑃ {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function JoinNode({ data }: { data: { label: string } }) {
  return (
    <div style={{ background: "#531dab", color: "#fff", borderRadius: 8, padding: "8px 16px", minWidth: 80, textAlign: "center", fontSize: 13 }}>
      <Handle type="target" position={Position.Top} />
      ⑄ {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function EndNode({ data }: { data: { label: string } }) {
  return (
    <div style={{ background: "#ff4d4f", color: "#fff", borderRadius: "50%", width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
      <Handle type="target" position={Position.Top} />
      {data.label}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  Start: StartNode,
  Task: TaskNode,
  Approval: ApprovalNode,
  Fork: ForkNode,
  Join: JoinNode,
  End: EndNode,
};

// ---- JSON serialization helpers ----

function stepsToNodes(steps: ProcessStep[]): Node[] {
  return steps.map((s, i) => ({
    id: s.step_id,
    type: s.step_type,
    position: { x: (s as ProcessStep & { position_x?: number }).position_x ?? 100 + i * 200, y: (s as ProcessStep & { position_y?: number }).position_y ?? 100 },
    data: { label: s.label, step_type: s.step_type, assigned_role: s.assigned_role ?? "", form_schema: s.form_schema ?? "" },
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

function nodesToSteps(nodes: Node[]): ProcessStep[] {
  return nodes.map((n) => ({
    step_id: n.id,
    step_type: n.type as ProcessStep["step_type"],
    label: (n.data as Record<string, string>).label ?? n.id,
    assigned_role: (n.data as Record<string, string>).assigned_role ?? undefined,
    form_schema: (n.data as Record<string, string>).form_schema ?? undefined,
    position_x: n.position.x,
    position_y: n.position.y,
  } as ProcessStep & { position_x: number; position_y: number }));
}

function edgesToTransitions(edges: Edge[]): ProcessTransition[] {
  return edges.map((e) => ({
    from_step: e.source,
    to_step: e.target,
    label: typeof e.label === "string" ? e.label : "",
  }));
}

let nodeCounter = 0;
function newId(prefix: string) {
  return `${prefix}_${++nodeCounter}_${Date.now()}`;
}

// ---- Main component ----

export default function ProcessDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("Quy trình mới");
  const [definitionName, setDefinitionName] = useState<string | undefined>(id);
  const [status, setStatus] = useState<"Draft" | "Published" | "Suspended">("Draft");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [propForm] = Form.useForm();
  const rfWrapper = useRef<HTMLDivElement>(null);

  // Load existing definition
  useEffect(() => {
    if (!id || id === "new") return;
    setLoading(true);
    getDefinition(id)
      .then((def) => {
        setTitle(def.title);
        setDefinitionName(def.name);
        setStatus(def.status);
        const steps: ProcessStep[] = def.steps_json ? JSON.parse(def.steps_json) : [];
        const transitions: ProcessTransition[] = def.transitions_json ? JSON.parse(def.transitions_json) : [];
        setNodes(stepsToNodes(steps));
        setEdges(transitionsToEdges(transitions));
      })
      .catch(() => messageApi.error("Không thể tải quy trình"))
      .finally(() => setLoading(false));
  }, [id]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const addNode = (stepType: ProcessStep["step_type"]) => {
    const id = newId(stepType.toLowerCase());
    const labels: Record<string, string> = { Start: "Bắt đầu", Task: "Nhiệm vụ", Approval: "Phê duyệt", Fork: "Chia nhánh", Join: "Gộp nhánh", End: "Kết thúc" };
    const newNode: Node = {
      id,
      type: stepType,
      position: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 150 },
      data: { label: labels[stepType] ?? stepType, step_type: stepType, assigned_role: "", form_schema: "" },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    propForm.setFieldsValue({
      label: (node.data as Record<string, string>).label,
      assigned_role: (node.data as Record<string, string>).assigned_role,
      form_schema: (node.data as Record<string, string>).form_schema,
    });
    setDrawerOpen(true);
  }, [propForm]);

  const applyProperties = () => {
    if (!selectedNode) return;
    const vals = propForm.getFieldsValue();
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, label: vals.label, assigned_role: vals.assigned_role ?? "", form_schema: vals.form_schema ?? "" } }
          : n
      )
    );
    setDrawerOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const steps = nodesToSteps(nodes);
      const transitions = edgesToTransitions(edges);
      const saved = await saveDefinition({
        name: definitionName,
        title,
        steps_json: JSON.stringify(steps),
        transitions_json: JSON.stringify(transitions),
      });
      setDefinitionName(saved.name);
      setStatus(saved.status as "Draft" | "Published" | "Suspended");
      navigate(`/definitions/${saved.name}`, { replace: true });
      messageApi.success("Đã lưu nháp");
    } catch {
      messageApi.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!definitionName) {
      await handleSave();
      return;
    }
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
  };

  const addMenuItems = [
    { key: "Task", label: "Nhiệm vụ (Task)" },
    { key: "Approval", label: "Phê duyệt (Approval)" },
    { key: "Fork", label: "Chia nhánh (Fork)" },
    { key: "Join", label: "Gộp nhánh (Join)" },
    { key: "End", label: "Kết thúc (End)" },
  ];

  if (loading) return <Spin style={{ margin: "80px auto", display: "block" }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      {contextHolder}

      {/* Header */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 16, background: "#fff" }}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: 280, fontSize: 16, fontWeight: 600 }}
          placeholder="Tên quy trình"
        />
        <Tag color={status === "Published" ? "green" : status === "Draft" ? "blue" : "orange"}>{status === "Published" ? "Đã xuất bản" : status === "Draft" ? "Nháp" : "Tạm dừng"}</Tag>
        <div style={{ flex: 1 }} />
        <Space>
          <Dropdown
            menu={{
              items: addMenuItems,
              onClick: ({ key }) => addNode(key as ProcessStep["step_type"]),
            }}
          >
            <Button icon={<PlusOutlined />}>Thêm bước</Button>
          </Dropdown>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>Lưu nháp</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={handlePublish} loading={saving} disabled={status === "Published"}>Xuất bản</Button>
        </Space>
      </div>

      {/* Canvas */}
      <div ref={rfWrapper} style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <MiniMap />
          <Background />
        </ReactFlow>
      </div>

      {/* Hint when empty */}
      {nodes.length === 0 && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#bbb", textAlign: "center", pointerEvents: "none" }}>
          <Title level={4} style={{ color: "#bbb" }}>Nhấn "Thêm bước" để bắt đầu thiết kế</Title>
          <p>Kéo thả để di chuyển, kéo từ handle để tạo kết nối</p>
        </div>
      )}

      {/* Node properties drawer */}
      <Drawer
        title="Thuộc tính bước"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={<Button type="primary" onClick={applyProperties}>Áp dụng</Button>}
        width={360}
      >
        <Form form={propForm} layout="vertical">
          <Form.Item name="label" label="Tên bước">
            <Input />
          </Form.Item>
          <Form.Item name="assigned_role" label="Vai trò phụ trách">
            <Input placeholder="Ví dụ: Manager, Accountant" />
          </Form.Item>
          <Form.Item name="form_schema" label="Form Schema (JSON)">
            <Input.TextArea rows={6} placeholder='[{"fieldname":"amount","label":"Số tiền","fieldtype":"Currency"}]' />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
