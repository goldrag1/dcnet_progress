import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
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
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  SwapOutlined,
  RollbackOutlined,
  StopOutlined,
  UserSwitchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  getRunDetail,
  executeStep,
  withdrawRun,
  getComments,
  addComment,
  type RunDetail,
} from "../api/client";
import type { ProcessRunStep, ProcessRunComment, FormField } from "../api/types";

const { Title, Text } = Typography;
const { TextArea } = Input;

const statusColor: Record<string, string> = {
  Completed: "#52c41a",
  Active: "#1677ff",
  Pending: "#d9d9d9",
  Rejected: "#ff4d4f",
  Skipped: "#d9d9d9",
};
const statusLabel: Record<string, string> = {
  Completed: "Hoàn thành",
  Active: "Đang xử lý",
  Pending: "Chờ xử lý",
  Rejected: "Từ chối",
  Skipped: "Bỏ qua",
};
const runStatusColor: Record<string, string> = {
  Running: "blue",
  Completed: "green",
  Cancelled: "default",
  Rejected: "red",
  Draft: "default",
};
const runStatusLabel: Record<string, string> = {
  Running: "Đang chạy",
  Completed: "Hoàn thành",
  Cancelled: "Đã hủy",
  Rejected: "Từ chối",
  Draft: "Nháp",
};

function renderFormField(
  field: FormField,
  value: unknown,
  onChange: (key: string, val: unknown) => void,
  readOnly: boolean
) {
  if (readOnly) {
    return <Text>{value != null ? String(value) : "—"}</Text>;
  }
  switch (field.type) {
    case "number":
      return (
        <InputNumber style={{ width: "100%" }} value={value as number} onChange={(v) => onChange(field.key, v)} />
      );
    case "date":
      return <DatePicker style={{ width: "100%" }} onChange={(_, d) => onChange(field.key, d)} />;
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
        <TextArea rows={3} value={value as string} onChange={(e) => onChange(field.key, e.target.value)} />
      );
    default:
      return <Input value={value as string} onChange={(e) => onChange(field.key, e.target.value)} />;
  }
}

type ActionType = "Complete" | "Reject" | "Forward" | "Return" | "Reassign";

function ActionModal({
  step,
  action,
  open,
  allSteps,
  onCancel,
  onDone,
}: {
  step: ProcessRunStep;
  action: ActionType;
  open: boolean;
  allSteps: ProcessRunStep[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageApi, ctx] = message.useMessage();

  const schema: FormField[] = step.form_schema ?? [];
  const titles: Record<ActionType, string> = {
    Complete: "Hoàn thành bước",
    Reject: "Từ chối",
    Forward: "Chuyển tiếp",
    Return: "Trả về bước",
    Reassign: "Phân công lại",
  };

  const setField = (key: string, val: unknown) => setFormData((p) => ({ ...p, [key]: val }));

  const handleOk = async () => {
    for (const f of schema) {
      if (f.required && !formData[f.key]) {
        messageApi.warning(`Vui lòng điền "${f.label}"`);
        return;
      }
    }
    if ((action === "Forward" || action === "Reassign") && !target) {
      messageApi.warning("Vui lòng nhập người nhận");
      return;
    }
    setLoading(true);
    try {
      await executeStep({
        run: step.run,
        step: step.name,
        action,
        comment: comment || undefined,
        form_data: Object.keys(formData).length > 0 ? formData : undefined,
        forward_to: action === "Forward" ? target : undefined,
        reassign_to: action === "Reassign" ? target : undefined,
        return_to_step: action === "Return" ? target : undefined,
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
      {ctx}
      <Modal
        title={`${titles[action]}: ${step.label}`}
        open={open}
        onOk={handleOk}
        onCancel={onCancel}
        okText={titles[action]}
        okButtonProps={{ danger: action === "Reject", loading }}
      >
        {(action === "Complete" || action === "Reject") && schema.length > 0 && (
          <Form layout="vertical" style={{ marginBottom: 12 }}>
            {schema.map((f) => (
              <Form.Item key={f.key} label={f.label} required={f.required}>
                {renderFormField(f, formData[f.key], setField, false)}
              </Form.Item>
            ))}
          </Form>
        )}
        {(action === "Forward" || action === "Reassign") && (
          <Form.Item label="Email người nhận" required style={{ marginBottom: 12 }}>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="user@company.com"
            />
          </Form.Item>
        )}
        {action === "Return" && (
          <Form.Item label="Trả về bước" required style={{ marginBottom: 12 }}>
            <Select
              style={{ width: "100%" }}
              value={target}
              onChange={setTarget}
              placeholder="Chọn bước để trả về"
              options={allSteps
                .filter((s) => s.status === "Completed" && s.name !== step.name)
                .map((s) => ({ label: s.label, value: s.step_id }))}
            />
          </Form.Item>
        )}
        <TextArea
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
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<ProcessRunComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; step: ProcessRunStep | null; action: ActionType }>({
    open: false,
    step: null,
    action: "Complete",
  });
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [messageApi, ctx] = message.useMessage();

  const load = () => {
    if (!id) return;
    setLoading(true);
    getRunDetail(id)
      .then(setDetail)
      .catch(() => setError("Không thể tải chi tiết lượt chạy"))
      .finally(() => setLoading(false));
    getComments(id).then(setComments).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const sendComment = async () => {
    if (!commentText.trim() || !id) return;
    setCommentSending(true);
    try {
      await addComment({ run: id, content: commentText.trim() });
      setCommentText("");
      const updated = await getComments(id);
      setComments(updated);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      messageApi.error("Không thể gửi bình luận");
    } finally {
      setCommentSending(false);
    }
  };

  const handleWithdraw = () => {
    if (!id) return;
    Modal.confirm({
      title: "Thu hồi lượt chạy?",
      content: "Bạn có chắc muốn thu hồi lượt chạy này không?",
      okText: "Thu hồi",
      okButtonProps: { danger: true },
      onOk: async () => {
        await withdrawRun(id);
        messageApi.success("Đã thu hồi");
        load();
      },
    });
  };

  if (loading) return <Spin style={{ display: "block", margin: "80px auto" }} />;
  if (error || !detail) return <Alert type="error" message={error ?? "Không tìm thấy"} style={{ margin: 24 }} />;

  const { run, steps, activities } = detail;
  const activeSteps = steps.filter((s) => s.status === "Active");
  const isRunning = run.status === "Running";

  return (
    <>
      {ctx}
      <div style={{ padding: "0 24px 24px" }}>
        {/* Back + Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate("/runs")} />
          <Title level={4} style={{ margin: 0, flex: 1 }}>{run.title}</Title>
          <Tag color={runStatusColor[run.status] ?? "default"} style={{ fontSize: 14, padding: "2px 12px" }}>
            {runStatusLabel[run.status] ?? run.status}
          </Tag>
          {isRunning && (
            <Tooltip title="Thu hồi">
              <Button icon={<StopOutlined />} danger onClick={handleWithdraw} />
            </Tooltip>
          )}
        </div>

        {/* 2-column layout */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Left column: run info + active step form */}
          <div style={{ flex: 2, minWidth: 0 }}>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="Quy trình">{run.definition_title}</Descriptions.Item>
                <Descriptions.Item label="Người khởi tạo">{run.initiator}</Descriptions.Item>
                <Descriptions.Item label="Bắt đầu">
                  {run.started_at ? new Date(run.started_at).toLocaleString("vi-VN") : "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Kết thúc">
                  {run.completed_at ? new Date(run.completed_at).toLocaleString("vi-VN") : "—"}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Active step form + actions */}
            {activeSteps.map((step) => (
              <Card
                key={step.name}
                size="small"
                style={{ marginBottom: 12, borderColor: "#1677ff" }}
                title={
                  <Space>
                    <LoadingOutlined style={{ color: "#1677ff" }} />
                    <Text strong>{step.label}</Text>
                    {step.assigned_to && <Text type="secondary">→ {step.assigned_to}</Text>}
                  </Space>
                }
              >
                {/* Form fields from form_schema */}
                {step.form_schema && step.form_schema.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <Descriptions size="small" column={1} bordered>
                      {step.form_schema.map((f) => {
                        const runData = run.run_data ? (() => { try { return JSON.parse(run.run_data!); } catch { return {}; } })() : {};
                        return (
                          <Descriptions.Item key={f.key} label={f.label}>
                            {runData[f.key] != null ? String(runData[f.key]) : <Text type="secondary">Chưa điền</Text>}
                          </Descriptions.Item>
                        );
                      })}
                    </Descriptions>
                  </div>
                )}

                {/* Action buttons */}
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => setModal({ open: true, step, action: "Complete" })}
                  >Đồng ý</Button>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => setModal({ open: true, step, action: "Reject" })}
                  >Từ chối</Button>
                  <Button
                    icon={<SwapOutlined />}
                    onClick={() => setModal({ open: true, step, action: "Forward" })}
                  >Chuyển tiếp</Button>
                  <Button
                    icon={<RollbackOutlined />}
                    onClick={() => setModal({ open: true, step, action: "Return" })}
                  >Trả về</Button>
                  <Button
                    icon={<UserSwitchOutlined />}
                    onClick={() => setModal({ open: true, step, action: "Reassign" })}
                  >Phân công lại</Button>
                </Space>
              </Card>
            ))}

            {/* Comments */}
            <Card size="small" title="Bình luận">
              <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
                {comments.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 13 }}>Chưa có bình luận nào</Text>
                ) : (
                  comments.map((c) => (
                    <div key={c.name} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                      <Avatar size={32} icon={<UserOutlined />} />
                      <div style={{ flex: 1 }}>
                        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "8px 12px" }}>
                          <Text strong style={{ fontSize: 13 }}>{c.author_name ?? c.author}</Text>
                          <div style={{ marginTop: 4 }}>{c.content}</div>
                        </div>
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                          {new Date(c.creation).toLocaleString("vi-VN")}
                        </Text>
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <TextArea
                  rows={2}
                  placeholder="Nhập bình luận..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); sendComment(); } }}
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={commentSending}
                  onClick={sendComment}
                  disabled={!commentText.trim()}
                >Gửi</Button>
              </div>
            </Card>
          </div>

          {/* Right column: Step tracker */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <Card size="small" title="Theo dõi bước">
              {steps.map((s, idx) => {
                const color = statusColor[s.status] ?? "#d9d9d9";
                const isActive = s.status === "Active";
                const isDone = s.status === "Completed";
                // find activity for this step
                const act = [...activities].reverse().find((a) => a.run_step === s.name);

                return (
                  <div
                    key={s.name}
                    style={{ display: "flex", gap: 10, marginBottom: idx < steps.length - 1 ? 0 : 0 }}
                  >
                    {/* Timeline line + dot */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: isActive ? `2px solid #1677ff` : "2px solid transparent",
                        boxShadow: isActive ? "0 0 0 2px #bae0ff" : "none",
                      }}>
                        {isDone && <CheckCircleOutlined style={{ color: "#fff", fontSize: 11 }} />}
                        {isActive && <LoadingOutlined style={{ color: "#fff", fontSize: 10 }} />}
                        {!isDone && !isActive && <span style={{ width: 8, height: 8, background: "#999", borderRadius: "50%", display: "block" }} />}
                      </div>
                      {idx < steps.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 24, background: isDone ? "#52c41a" : "#e8e8e8", margin: "2px 0" }} />
                      )}
                    </div>

                    {/* Step info */}
                    <div style={{ flex: 1, paddingBottom: 16 }}>
                      <Text strong={isActive} style={{ fontSize: 13, color: isActive ? "#1677ff" : undefined }}>
                        {s.label}
                      </Text>
                      <div>
                        <Tag style={{ fontSize: 11, padding: "0 4px", lineHeight: "18px" }} color={
                          s.status === "Completed" ? "success" : s.status === "Active" ? "processing" : s.status === "Rejected" ? "error" : "default"
                        }>
                          {statusLabel[s.status] ?? s.status}
                        </Tag>
                      </div>
                      {s.assigned_to && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <Avatar size={16} icon={<UserOutlined />} />
                          <Text type="secondary" style={{ fontSize: 11 }}>{s.assigned_to}</Text>
                        </div>
                      )}
                      {act && act.timestamp && (
                        <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                          {new Date(act.timestamp).toLocaleString("vi-VN")}
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>

            {/* Activity log */}
            <Card size="small" title="Nhật ký" style={{ marginTop: 12 }}>
              <div style={{ maxHeight: 250, overflowY: "auto" }}>
                {activities.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>Chưa có hoạt động</Text>
                ) : (
                  [...activities].reverse().map((a) => (
                    <div key={a.name} style={{ borderBottom: "1px solid #f0f0f0", padding: "6px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <Text strong style={{ fontSize: 12 }}>{a.actor}</Text>
                        <Tag style={{ fontSize: 11 }} color={
                          a.action === "Complete" ? "green" : a.action === "Reject" ? "red" : "blue"
                        }>
                          {a.action === "Complete" ? "Hoàn thành" : a.action === "Reject" ? "Từ chối" : a.action === "Comment" ? "Bình luận" : a.action === "Start" ? "Khởi chạy" : a.action === "Reassign" ? "Giao lại" : a.action === "Forward" ? "Chuyển tiếp" : a.action === "Return" ? "Trả về" : "Thu hồi"}
                        </Tag>
                      </div>
                      {a.comment && <Text style={{ fontSize: 11, color: "#666" }}>{a.comment}</Text>}
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(a.timestamp).toLocaleString("vi-VN")}
                        </Text>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Action modal */}
      {modal.step && (
        <ActionModal
          step={modal.step}
          action={modal.action}
          open={modal.open}
          allSteps={steps}
          onCancel={() => setModal((s) => ({ ...s, open: false }))}
          onDone={() => { setModal((s) => ({ ...s, open: false })); load(); }}
        />
      )}
    </>
  );
}
