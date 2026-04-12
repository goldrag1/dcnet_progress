import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import { getRunDetail, executeStep, type RunDetail } from "../api/client";
import type { ProcessRunStep, FormField } from "../api/types";

const { Title, Text } = Typography;

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  Pending: { color: "default", icon: <ClockCircleOutlined />, label: "Chờ xử lý" },
  Active: { color: "processing", icon: <LoadingOutlined />, label: "Đang xử lý" },
  Completed: { color: "success", icon: <CheckCircleOutlined />, label: "Hoàn thành" },
  Rejected: { color: "error", icon: <CloseCircleOutlined />, label: "Từ chối" },
  Skipped: { color: "default", icon: <MinusCircleOutlined />, label: "Bỏ qua" },
};

const runStatusColor: Record<string, string> = {
  Running: "blue",
  Completed: "green",
  Cancelled: "default",
  Rejected: "red",
};

function renderFormField(field: FormField, value: unknown, onChange: (key: string, val: unknown) => void) {
  switch (field.type) {
    case "number":
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={value as number}
          onChange={(v) => onChange(field.key, v)}
        />
      );
    case "date":
      return (
        <DatePicker
          style={{ width: "100%" }}
          onChange={(_, dateStr) => onChange(field.key, dateStr)}
        />
      );
    case "select":
      return (
        <Select
          style={{ width: "100%" }}
          value={value as string}
          onChange={(v) => onChange(field.key, v)}
          options={(field.options ?? []).map((o) => ({ label: o, value: o }))}
        />
      );
    case "textarea":
      return (
        <Input.TextArea
          rows={3}
          value={value as string}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
    default:
      return (
        <Input
          value={value as string}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
  }
}

function StepActionModal({
  step,
  action,
  open,
  onCancel,
  onDone,
}: {
  step: ProcessRunStep;
  action: "Complete" | "Reject" | "Comment";
  open: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const schema: FormField[] = step.form_schema ?? [];
  const labels: Record<string, string> = { Complete: "Hoàn thành", Reject: "Từ chối", Comment: "Bình luận" };

  const setField = (key: string, val: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
  };

  const handleOk = async () => {
    // Validate required fields
    for (const field of schema) {
      if (field.required && !formData[field.key]) {
        messageApi.warning(`Vui lòng điền "${field.label}"`);
        return;
      }
    }
    setLoading(true);
    try {
      await executeStep({
        run: step.run,
        step: step.name,
        action,
        comment,
        form_data: Object.keys(formData).length > 0 ? formData : undefined,
      });
      onDone();
    } catch {
      messageApi.error("Xử lý thất bại — vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={`${labels[action]}: ${step.label}`}
        open={open}
        onOk={handleOk}
        onCancel={onCancel}
        okText={labels[action]}
        okButtonProps={{ danger: action === "Reject", loading }}
      >
        {schema.length > 0 && (
          <Form layout="vertical" style={{ marginBottom: 12 }}>
            {schema.map((field) => (
              <Form.Item
                key={field.key}
                label={field.label}
                required={field.required}
              >
                {renderFormField(field, formData[field.key], setField)}
              </Form.Item>
            ))}
          </Form>
        )}
        <Input.TextArea
          rows={3}
          placeholder="Ghi chú (tuỳ chọn)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </>
  );
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{
    open: boolean;
    step: ProcessRunStep | null;
    action: "Complete" | "Reject" | "Comment";
  }>({ open: false, step: null, action: "Complete" });

  const load = () => {
    if (!id) return;
    setLoading(true);
    getRunDetail(id)
      .then(setDetail)
      .catch(() => setError("Không thể tải chi tiết lượt chạy"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <Spin style={{ display: "block", margin: "80px auto" }} />;
  if (error || !detail) return <Alert type="error" message={error ?? "Không tìm thấy"} style={{ margin: 24 }} />;

  const { run, steps, activities } = detail;

  const activeSteps = steps.filter((s) => s.status === "Active");

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Run header */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{run.title}</Title>
            <Text type="secondary">{run.definition_title}</Text>
          </div>
          <Tag color={runStatusColor[run.status] ?? "default"} style={{ fontSize: 14, padding: "4px 12px" }}>
            {run.status === "Running" ? "Đang chạy" : run.status === "Completed" ? "Hoàn thành" : run.status === "Cancelled" ? "Đã huỷ" : "Bị từ chối"}
          </Tag>
        </div>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Người khởi tạo">{run.initiator}</Descriptions.Item>
          <Descriptions.Item label="Bắt đầu">{run.started_at ? new Date(run.started_at).toLocaleString("vi-VN") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Kết thúc">{run.completed_at ? new Date(run.completed_at).toLocaleString("vi-VN") : "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Action required */}
      {activeSteps.length > 0 && (
        <Card title="Cần xử lý" style={{ marginBottom: 24, borderColor: "#1677ff" }}>
          {activeSteps.map((step) => (
            <div key={step.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ flex: 1 }}>
                <Text strong>{step.label}</Text>
                {step.assigned_to && <Text type="secondary" style={{ marginLeft: 8 }}>→ {step.assigned_to}</Text>}
              </div>
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setModalState({ open: true, step, action: "Complete" })}
                >Hoàn thành</Button>
                <Button
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={() => setModalState({ open: true, step, action: "Reject" })}
                >Từ chối</Button>
                <Button
                  size="small"
                  icon={<CommentOutlined />}
                  onClick={() => setModalState({ open: true, step, action: "Comment" })}
                >Bình luận</Button>
              </Space>
            </div>
          ))}
        </Card>
      )}

      {/* Step timeline */}
      <Card title="Các bước quy trình" style={{ marginBottom: 24 }}>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={steps.map((s) => {
            const cfg = statusConfig[s.status] ?? statusConfig.Pending;
            return {
              title: s.label,
              description: (
                <Space size="small">
                  <Tag color={cfg.color}>{cfg.label}</Tag>
                  {s.assigned_to && <Text type="secondary" style={{ fontSize: 12 }}>→ {s.assigned_to}</Text>}
                  {s.completed_at && <Text type="secondary" style={{ fontSize: 12 }}>{new Date(s.completed_at).toLocaleString("vi-VN")}</Text>}
                </Space>
              ),
              icon: cfg.icon,
              status: s.status === "Completed" ? "finish" : s.status === "Active" ? "process" : s.status === "Rejected" ? "error" : "wait",
            };
          })}
        />
      </Card>

      {/* Activity log */}
      <Card title="Nhật ký hoạt động">
        {activities.length === 0 ? (
          <Text type="secondary">Chưa có hoạt động nào</Text>
        ) : (
          <Timeline
            mode="left"
            items={[...activities].reverse().map((a) => ({
              key: a.name,
              label: new Date(a.timestamp).toLocaleString("vi-VN"),
              children: (
                <div>
                  <Text strong>{a.actor}</Text>
                  {" — "}
                  <Tag color={a.action === "Complete" ? "green" : a.action === "Reject" ? "red" : "blue"}>
                    {a.action === "Complete" ? "Hoàn thành" : a.action === "Reject" ? "Từ chối" : a.action === "Comment" ? "Bình luận" : a.action === "Start" ? "Khởi chạy" : a.action === "Reassign" ? "Giao lại" : "Thu hồi"}
                  </Tag>
                  {a.comment && <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>{a.comment}</div>}
                </div>
              ),
            }))}
          />
        )}
      </Card>

      {/* Action modal */}
      {modalState.step && (
        <StepActionModal
          step={modalState.step}
          action={modalState.action}
          open={modalState.open}
          onCancel={() => setModalState((s) => ({ ...s, open: false }))}
          onDone={() => {
            setModalState((s) => ({ ...s, open: false }));
            load();
          }}
        />
      )}
    </div>
  );
}
