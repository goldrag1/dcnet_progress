import { useState, useEffect } from "react";
import { Modal, Form, Select, Input, Button, message } from "antd";
import { getDefinitionList, startRun } from "../../api/client";
import type { ProcessDefinition, ProcessRun } from "../../api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onStarted: (run: ProcessRun) => void;
}

export default function StartRunModal({ open, onClose, onStarted }: Props) {
  const [form] = Form.useForm();
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      getDefinitionList({ status: "Published" })
        .then((res) => setDefinitions(res.data))
        .catch(() => {});
    }
  }, [open]);

  async function handleOk() {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const run = await startRun({
        definition: values.definition,
        title: values.title,
      });
      message.success("Đã khởi động quy trình");
      form.resetFields();
      onStarted(run);
    } catch (_e) {
      message.error("Không thể khởi động quy trình");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Chạy quy trình"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button key="ok" type="primary" loading={loading} onClick={handleOk}>
          Bắt đầu
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="definition"
          label="Chọn quy trình"
          rules={[{ required: true, message: "Vui lòng chọn quy trình" }]}
        >
          <Select
            placeholder="Tìm kiếm quy trình..."
            showSearch
            optionFilterProp="label"
            options={definitions.map((d) => ({ value: d.name, label: d.title }))}
          />
        </Form.Item>
        <Form.Item name="title" label="Tiêu đề (tùy chọn)">
          <Input placeholder="Để trống để dùng tiêu đề mặc định" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
