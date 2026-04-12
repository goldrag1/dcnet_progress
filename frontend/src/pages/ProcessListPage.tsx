import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, Tag, Button, Space, Typography, Alert, Spin, Select, Modal, Form, Input,
} from "antd";
import { PlusOutlined, PlayCircleOutlined, EditOutlined } from "@ant-design/icons";
import { getDefinitionList, startRun } from "../api/client";
import type { ProcessDefinition } from "../api/types";

const { Title } = Typography;

const STATUS_COLOR: Record<string, string> = {
  Draft: "default",
  Published: "green",
  Suspended: "orange",
};

const STATUS_LABEL: Record<string, string> = {
  Draft: "Bản nháp",
  Published: "Đang hoạt động",
  Suspended: "Tạm dừng",
};

export default function ProcessListPage() {
  const navigate = useNavigate();
  const [defs, setDefs] = useState<ProcessDefinition[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start run modal
  const [startModal, setStartModal] = useState<ProcessDefinition | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [form] = Form.useForm();

  async function load(p = 1, status?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await getDefinitionList({ page: p, page_size: 20, status });
      setDefs(res.data);
      setTotal(res.total);
      setPage(p);
    } catch {
      setError("Không thể tải danh sách quy trình. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1, statusFilter); }, [statusFilter]);

  async function handleStartRun() {
    if (!startModal) return;
    try {
      const values = await form.validateFields();
      setStartLoading(true);
      const run = await startRun({ definition: startModal.name, title: values.title });
      setStartModal(null);
      form.resetFields();
      navigate(`/runs/${run.name}`);
    } catch {
      // form validation error or API error — stay open
    } finally {
      setStartLoading(false);
    }
  }

  const columns = [
    {
      title: "Tên quy trình",
      dataIndex: "title",
      key: "title",
      render: (text: string, record: ProcessDefinition) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{text}</span>
          {record.description && (
            <span style={{ color: "#888", fontSize: 12 }}>{record.description}</span>
          )}
        </Space>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] ?? "default"}>{STATUS_LABEL[s] ?? s}</Tag>
      ),
    },
    {
      title: "Phiên bản",
      dataIndex: "version",
      key: "version",
      width: 100,
      render: (v: number) => `v${v}`,
    },
    {
      title: "",
      key: "actions",
      width: 180,
      render: (_: unknown, record: ProcessDefinition) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => navigate(`/definitions/${record.name}`)}
          >
            Sửa
          </Button>
          {record.status === "Published" && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              size="small"
              onClick={() => {
                setStartModal(record);
                form.setFieldValue("title", `${record.title} - ${new Date().toLocaleDateString("vi-VN")}`);
              }}
            >
              Khởi chạy
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Title level={4} style={{ margin: 0 }}>Danh sách quy trình</Title>
        <Space>
          <Select
            placeholder="Lọc trạng thái"
            allowClear
            style={{ width: 180 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: "Draft", label: "Bản nháp" },
              { value: "Published", label: "Đang hoạt động" },
              { value: "Suspended", label: "Tạm dừng" },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/definitions/new")}
          >
            Tạo quy trình mới
          </Button>
        </Space>
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        <Table
          dataSource={defs}
          columns={columns}
          rowKey="name"
          locale={{ emptyText: "Chưa có quy trình nào" }}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: (p) => load(p, statusFilter),
            showTotal: (t) => `Tổng ${t} quy trình`,
          }}
          style={{ background: "#fff", borderRadius: 8 }}
        />
      </Spin>

      <Modal
        title={`Khởi chạy: ${startModal?.title}`}
        open={!!startModal}
        onOk={handleStartRun}
        onCancel={() => { setStartModal(null); form.resetFields(); }}
        confirmLoading={startLoading}
        okText="Khởi chạy"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="Tiêu đề lần chạy"
            rules={[{ required: true, message: "Vui lòng nhập tiêu đề" }]}
          >
            <Input placeholder="Nhập tiêu đề..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
