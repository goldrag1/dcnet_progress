import { useQuery } from "@tanstack/react-query";
import { Card, Col, Row, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getDashboardStats } from "../api/client";
import type { DashboardStats } from "../api/types";

const { Title } = Typography;

const STATUS_LABELS: Record<string, string> = {
  Running: "Đang chạy",
  Completed: "Hoàn thành",
  Rejected: "Từ chối",
  Cancelled: "Đã hủy",
};

const STATUS_COLORS: Record<string, string> = {
  Running: "#1677ff",
  Completed: "#52c41a",
  Rejected: "#ff4d4f",
  Cancelled: "#faad14",
};

const backlogColumns: ColumnsType<{ definition_title: string; count: number }> = [
  { title: "Quy trình", dataIndex: "definition_title", key: "definition_title" },
  { title: "Số bước chờ", dataIndex: "count", key: "count", width: 120, align: "right" },
];

const recentColumns: ColumnsType<{ name: string; title: string; completed_at: string }> = [
  { title: "Mã", dataIndex: "name", key: "name", width: 120 },
  { title: "Tiêu đề", dataIndex: "title", key: "title" },
  {
    title: "Hoàn thành lúc",
    dataIndex: "completed_at",
    key: "completed_at",
    width: 180,
    render: (v: string) => (v ? new Date(v).toLocaleString("vi-VN") : "—"),
  },
];

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => getDashboardStats({ days: 30 }),
  });

  const statusCounts = data?.status_counts ?? [];
  const backlog = data?.backlog ?? [];
  const recentCompleted = data?.recent_completed ?? [];

  const statMap = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));

  return (
    <div style={{ padding: "24px" }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        Tổng quan — 30 ngày gần nhất
      </Title>

      {/* Status counters */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {["Running", "Completed", "Rejected", "Cancelled"].map((status) => (
          <Col key={status} xs={12} sm={6}>
            <Card loading={isLoading}>
              <Statistic
                title={STATUS_LABELS[status] ?? status}
                value={statMap[status] ?? 0}
                valueStyle={{ color: STATUS_COLORS[status] }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Backlog */}
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="Bước đang tồn đọng (theo quy trình)" style={{ marginBottom: 16 }}>
            <Table
              dataSource={backlog}
              columns={backlogColumns}
              rowKey="definition_title"
              size="small"
              pagination={false}
              loading={isLoading}
              locale={{ emptyText: "Không có bước tồn đọng" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Gần đây đã hoàn thành">
            <Table
              dataSource={recentCompleted}
              columns={recentColumns}
              rowKey="name"
              size="small"
              pagination={false}
              loading={isLoading}
              locale={{ emptyText: "Chưa có lượt chạy hoàn thành" }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
