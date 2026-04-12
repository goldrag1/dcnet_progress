import frappe
from frappe.model.document import Document

class ProcessDefinition(Document):
    def validate(self):
        if self.status == "Published":
            self._validate_graph()

    def _validate_graph(self):
        steps = {s.step_id: s for s in self.steps}
        start_nodes = [s for s in self.steps if s.step_type == "Start"]
        end_nodes = [s for s in self.steps if s.step_type == "End"]

        if len(start_nodes) != 1:
            frappe.throw("Quy trình phải có đúng 1 bước Bắt đầu")
        if len(end_nodes) < 1:
            frappe.throw("Quy trình phải có ít nhất 1 bước Kết thúc")

        reachable = set()
        queue = [start_nodes[0].step_id]
        while queue:
            current = queue.pop(0)
            if current in reachable:
                continue
            reachable.add(current)
            for t in self.transitions:
                if t.from_step == current:
                    queue.append(t.to_step)

        unreachable = set(s.step_id for s in self.steps) - reachable
        if unreachable:
            labels = [steps[sid].label for sid in unreachable if sid in steps]
            frappe.throw(f"Các bước không thể truy cập từ Bắt đầu: {', '.join(labels)}")
