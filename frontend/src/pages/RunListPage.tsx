import { useQuery } from "@tanstack/react-query";
import { Table, Tag, Typography, Select, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRunList } from "../api/client";
import type { ProcessRun } from "../api/types";

const { Title } = Typography;

const STATUS_COLOR: Record<string, string> = {
  Running: "blue",
  Completed: "green",
  Cancelled: "orange",
  Rejected: "red",
  Draft: "default",
};

const STATUS_LABEL: Record<string, string> = {
  Running: "Đang chạy",
  Completed: "Hoàn thành",
  Cancelled: "Đã hủy",
  Rejected: "Từ chối",
  Draft: "Nháp",
};

const columns: ColumnsType<ProcessRun> = [
  { title: "Mã", dataIndex: "name", key: "name", width: 130 },
  { title: "Tiêu đề", dataIndex: "title", key: "title" },
  { title: "Quy trình", dataIndex: "definition_title", key: "definition_title" },
  { title: "Người tạo", dataIndex: "initiator", key: "initiator", width: 160 },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    width: 130,
    render: (s: string) => (
      <Tag color={STATUS_COLOR[s] ?? "default"}>{STATUS_LABEL[s] ?? s}</Tag>
    ),
  },
  {
    title: "Bắt đầu",
    dataIndex: "started_at",
    key: "started_at",
    width: 160,
    render: (v: string) => (v ? new Date(v).toLocaleString("vi-VN") : "—"),
  },
];

export default function RunListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["run-list", status, page],
    queryFn: () => getRunList({ status, page, page_size: pageSize }),
  });

  return (
    <div style={{ background: "#fff", padding: 24, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Tất cả lượt chạy</Title>
        <Space>
          <Select
            allowClear
            placeholder="Lọc trạng thái"
            style={{ width: 160 }}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "Running", label: "Đang chạy" },
              { value: "Completed", label: "Hoàn thành" },
              { value: "Cancelled", label: "Đã hủy" },
              { value: "Rejected", label: "Từ chối" },
              { value: "Draft", label: "Nháp" },
            ]}
          />
        </Space>
      </div>
      <Table
        dataSource={data?.data ?? []}
        columns={columns}
        rowKey="name"
        loading={isLoading}
        size="small"
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `Tổng ${t} lượt chạy`,
        }}
        onRow={(record) => ({
          onClick: () => navigate(`/runs/${record.name}`),
          style: { cursor: "pointer" },
        })}
        locale={{ emptyText: "Không có lượt chạy nào" }}
      />
    </div>
  );
}
