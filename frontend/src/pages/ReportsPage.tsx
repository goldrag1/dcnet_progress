import { useState, useEffect } from "react";
import { Row, Col, Card, Statistic, Table, Button, message, Spin } from "antd";
import {
  FileExcelOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  FileOutlined,
  OrderedListOutlined,
} from "@ant-design/icons";
import { getDashboardOverview, exportDashboard } from "../api/client";
import type { DashboardOverview } from "../api/types";

export default function ReportsPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardOverview()
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleExport() {
    try {
      exportDashboard();
    } catch (_e) {
      message.error("Không thể xuất báo cáo");
    }
  }

  if (loading) return <Spin style={{ display: "block", margin: "48px auto" }} />;

  const deptColumns = [
    { title: "Phòng ban", dataIndex: "department", key: "department" },
    { title: "Số lượt chờ", dataIndex: "count", key: "count" },
  ];

  const personColumns = [
    { title: "Người dùng", dataIndex: "full_name", key: "full_name" },
    { title: "Số lượt chờ", dataIndex: "count", key: "count" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Báo cáo &amp; Thống kê</h2>
        <Button icon={<FileExcelOutlined />} onClick={handleExport}>
          Xuất Excel
        </Button>
      </div>

      {/* 5 stat cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic title="Tổng số" value={overview?.total ?? 0} prefix={<OrderedListOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Đang thực hiện"
              value={overview?.running ?? 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Đã hoàn thành"
              value={overview?.completed ?? 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Đã hủy"
              value={overview?.cancelled ?? 0}
              prefix={<StopOutlined />}
              valueStyle={{ color: "#ff4d4f" }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Nháp"
              value={overview?.draft ?? 0}
              prefix={<FileOutlined />}
              valueStyle={{ color: "#8c8c8c" }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Tồn đọng theo phòng ban">
            <Table
              dataSource={overview?.backlog_by_dept ?? []}
              columns={deptColumns}
              rowKey="department"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Tồn đọng theo người">
            <Table
              dataSource={overview?.backlog_by_person ?? []}
              columns={personColumns}
              rowKey="user"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
