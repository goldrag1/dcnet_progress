import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Tag, Button, Space, Typography, Alert, Spin } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { getMyTasks } from "../api/client";
import type { MyTask } from "../api/types";

const { Title } = Typography;

const STEP_TYPE_COLOR: Record<string, string> = {
  Task: "blue",
  Approval: "orange",
  Start: "green",
  End: "gray",
};

export default function MyTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(p = 1) {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyTasks({ page: p, page_size: 20 });
      setTasks(res.data);
      setTotal(res.total);
      setPage(p);
    } catch {
      setError("Không thể tải danh sách việc. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const columns = [
    {
      title: "Quy trình",
      dataIndex: "definition_title",
      key: "definition_title",
      render: (text: string, record: MyTask) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{text}</span>
          <span style={{ color: "#888", fontSize: 12 }}>{record.run_title}</span>
        </Space>
      ),
    },
    {
      title: "Bước",
      dataIndex: "label",
      key: "label",
      render: (text: string, record: MyTask) => (
        <Space>
          <Tag color={STEP_TYPE_COLOR[record.step_type] ?? "default"}>{record.step_type}</Tag>
          {text}
        </Space>
      ),
    },
    {
      title: "Bắt đầu",
      dataIndex: "started_at",
      key: "started_at",
      render: (v: string) => v ? new Date(v).toLocaleString("vi-VN") : "—",
      width: 160,
    },
    {
      title: "",
      key: "action",
      width: 120,
      render: (_: unknown, record: MyTask) => (
        <Button
          type="primary"
          icon={<ArrowRightOutlined />}
          size="small"
          onClick={() => navigate(`/runs/${record.run}`)}
        >
          Xử lý
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Việc của tôi</Title>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        <Table
          dataSource={tasks}
          columns={columns}
          rowKey="name"
          locale={{ emptyText: "Không có việc nào đang chờ xử lý" }}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: (p) => load(p),
            showTotal: (t) => `Tổng ${t} việc`,
          }}
          style={{ background: "#fff", borderRadius: 8 }}
        />
      </Spin>
    </div>
  );
}
