---
project: frappe-bench-dcnet
base_branch: master
---

# dcnet_progress — Visual Form Builder

**Date:** 2026-04-13
**Status:** Draft
**Scope:** Replace raw JSON textarea in designer's "Biểu mẫu" tab with visual form builder UI

## 1. Problem

The designer step config tab "Biểu mẫu" is currently a raw JSON textarea (DesignerPage.tsx:414-422). Users must manually type JSON like `[{"key":"amount","label":"Số tiền","type":"number","required":true}]` to add form fields to a step. This is unusable for non-technical users (accountants, HR, operations staff at DCNET).

Misa AMIS Quy trình uses a fully visual form builder where users click field types from a palette to add fields, then configure properties inline. Zero JSON exposure.

## 2. Goal

Replace the JSON textarea with a visual form builder that matches Misa AMIS UX:
- Click field type in palette → field card appears in center
- Click field card → inline property editor expands
- Reorder fields via drag or up/down buttons
- Delete fields via button
- User never sees JSON

## 3. Current Architecture

### 3.1 Data Model (no changes needed)

`ProcessStep.form_schema` stores a JSON string of `FormField[]`:

```typescript
// api/types.ts:3-10
export interface FormField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "link";
  required?: boolean;
  options?: string[];       // for select type
  link_doctype?: string;    // for link type
}
```

This structure stays the same. The form builder generates this JSON visually instead of requiring manual editing.

### 3.2 Files Affected

| File | Change |
|------|--------|
| `frontend/src/pages/DesignerPage.tsx` | Replace "Biểu mẫu" tab content (~30 lines) with FormBuilder component |
| `frontend/src/components/designer/FormBuilder.tsx` | **NEW** — visual form builder component |
| `frontend/src/components/designer/FieldCard.tsx` | **NEW** — single field card with inline editor |
| `frontend/src/api/types.ts` | No change — existing FormField type is sufficient |
| `frontend/src/pages/RunDetailPage.tsx` | Minor: add checkbox + link rendering in renderFormField() |

### 3.3 Existing Code to Reuse

- **Palette** (DesignerPage.tsx:40-48, 482-506): Already has `FIELD_TYPES` array and click handler `addFieldToForm()`. Move into FormBuilder.
- **renderFormField()** (RunDetailPage.tsx:78-110): Runtime renderer. Reuse for live preview in designer.
- **addFieldToForm()** (DesignerPage.tsx:257-270): Already parses JSON, appends field, updates state. Refactor into FormBuilder.

## 4. UI Specification

### 4.1 FormBuilder Component (center panel, replaces JSON textarea)

When no fields exist:
```
┌────────────────────────────────────────────┐
│  ⊞  Chưa có trường nào                    │
│     Nhấn vào loại trường bên phải để thêm │
└────────────────────────────────────────────┘
```

With fields:
```
┌────────────────────────────────────────────┐
│ ┌────────────────────────────────────────┐ │
│ │ 1. Số tiền               [number] [*] │ │
│ │    ↑ ↓ ✎ ✕                            │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ 2. Lý do                   [text]     │ │
│ │    ↑ ↓ ✎ ✕                            │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ ▼ 3. Loại yêu cầu       [select] [*] │ │ ← expanded
│ │    ↑ ↓ ✎ ✕                            │ │
│ │  ┌──────────────────────────────────┐  │ │
│ │  │ Nhãn:     [Loại yêu cầu      ]  │  │ │
│ │  │ Key:      [loai_yeu_cau       ]  │  │ │
│ │  │ Bắt buộc: [✓]                   │  │ │
│ │  │ Danh sách lựa chọn:             │  │ │
│ │  │   Mua hàng                [✕]   │  │ │
│ │  │   Sửa chữa               [✕]   │  │ │
│ │  │   Khác                    [✕]   │  │ │
│ │  │   [+ Thêm lựa chọn]             │  │ │
│ │  └──────────────────────────────────┘  │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### 4.2 FieldCard States

**Collapsed (default):**
- Row: `{index}. {label}` + type badge + required indicator `[*]`
- Action buttons: ↑ (move up) ↓ (move down) ✎ (toggle edit) ✕ (delete)
- Click anywhere on card → expand property editor

**Expanded (editing):**
- Same header row
- Property editor below with fields depending on type:

| Field Type | Properties |
|-----------|-----------|
| All types | Nhãn (label), Key (auto-slug from label), Bắt buộc (required toggle) |
| text | — |
| textarea | — |
| number | — |
| date | — |
| checkbox | — |
| select | Danh sách lựa chọn: editable tag list with + button |
| link | DocType: text input for doctype name |

### 4.3 Field Palette (right panel — minor refactor)

Already exists (DesignerPage.tsx:482-506). Changes:
- Move `FIELD_TYPES` and palette rendering into FormBuilder or keep in DesignerPage (palette stays in right panel)
- When user clicks a palette item:
  1. Append new field to form_schema with auto-generated key + label
  2. Auto-expand the new field's property editor
  3. Auto-focus the label input so user can immediately rename

### 4.4 Key Auto-Generation

When user types a label, auto-generate key via slug:
- `"Số tiền"` → `"so_tien"`
- `"Lý do yêu cầu"` → `"ly_do_yeu_cau"`
- Vietnamese diacritics stripped, spaces → underscores, lowercase

User can manually override the key. Key must be unique within the step's form_schema.

### 4.5 Delete Confirmation

Deleting a field shows Ant Design `Popconfirm`: "Xóa trường này?" with Xóa / Hủy buttons.

### 4.6 Live Preview (optional, nice-to-have)

Below the field list, show a "Xem trước" (Preview) section that renders the form using the existing `renderFormField()` function. This gives the designer a real preview of what users will see at runtime.

## 5. State Management

### 5.1 Data Flow

```
Palette click → addField() → update fields[] state → serialize to JSON string
                                                     → set on step.form_schema
                                                     → sync to parent DesignerPage state

FieldCard edit → updateField(index, patch) → same flow

FieldCard delete → removeField(index) → same flow

FieldCard reorder → moveField(index, direction) → same flow
```

### 5.2 FormBuilder Props

```typescript
interface FormBuilderProps {
  value: string;              // JSON string of FormField[]
  onChange: (json: string) => void;  // callback with updated JSON string
  disabled?: boolean;         // read-only when definition is published
}
```

The FormBuilder internally parses the JSON string to `FormField[]`, manages a local state array, and calls `onChange()` with the serialized result on every edit. This keeps the parent DesignerPage's Form.Item binding intact.

### 5.3 Integration with DesignerPage

Replace lines 414-422 in DesignerPage.tsx:

```tsx
// Before (raw textarea):
<Form.Item name="form_schema" label="Cấu hình trường (JSON)">
  <Input.TextArea rows={8} />
</Form.Item>

// After (visual builder):
<Form.Item name="form_schema" noStyle>
  <FormBuilder disabled={definition?.status === "Published"} />
</Form.Item>
```

Ant Design's Form.Item passes `value` and `onChange` to the child component automatically.

## 6. Rendering Gaps to Fix

While building the form builder, also fix incomplete rendering in `renderFormField()` (RunDetailPage.tsx:78-110):

| Type | Current | Fix |
|------|---------|-----|
| checkbox | Falls through to default (text input) | Render `<Checkbox>` |
| link | Falls through to default (text input) | Render `<Input>` with placeholder "DocType/{link_doctype}" (basic, no autocomplete) |

## 7. Vietnamese Slug Utility

Create a shared utility for key auto-generation:

```typescript
// utils/slug.ts
const DIACRITICS: Record<string, string> = {
  'à':'a','á':'a','ả':'a','ã':'a','ạ':'a',
  'ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a',
  'â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a',
  'đ':'d',
  'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
  'ê':'e','ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e',
  'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
  'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o',
  'ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o',
  'ơ':'o','ờ':'o','ớ':'o','ở':'o','ỡ':'o','ợ':'o',
  'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
  'ư':'u','ừ':'u','ứ':'u','ử':'u','ữ':'u','ự':'u',
  'ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y',
};

export function vnSlug(label: string): string {
  return label
    .toLowerCase()
    .split('')
    .map(c => DIACRITICS[c] || c)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
```

## 8. Acceptance Criteria

### Form Builder UI
- [ ] "Biểu mẫu" tab shows visual field list, NOT JSON textarea
- [ ] Click palette item → field card appended to list
- [ ] New field auto-expands with label input focused
- [ ] Type label → key auto-generated (Vietnamese slug)
- [ ] Key field editable, must be unique (show error if duplicate)
- [ ] Required toggle works
- [ ] Select type: can add/remove options
- [ ] Link type: can set doctype name
- [ ] Move up/down buttons reorder fields
- [ ] Delete with Popconfirm removes field
- [ ] Changes auto-sync to parent state (no separate Save button for form schema)
- [ ] Published definition: form builder is read-only (disabled)

### Integration
- [ ] Save definition → form_schema JSON correct in backend
- [ ] Load definition → form builder renders existing fields correctly
- [ ] Start a run → form fields render correctly in ActionModal
- [ ] Fill form + submit → form_data saved correctly
- [ ] Empty form_schema → empty state message shown

### Rendering Fixes
- [ ] Checkbox field type renders as `<Checkbox>` at runtime
- [ ] Link field type renders as `<Input>` at runtime

### Build
- [ ] `npx tsc --noEmit` passes
- [ ] `yarn build` succeeds
- [ ] No console errors on designer page

## 9. Out of Scope

- Drag-and-drop reordering (use up/down buttons instead — simpler, works on mobile)
- New field types (Table, Signature, Attach) — separate spec
- Field conditions (show/hide based on other field values) — Phase 2 spec §2.3
- Field security (visible_to per step) — Phase 2 spec §2.3
- Default values (preset / remember last) — separate spec
- Form preview panel — nice-to-have, not required

## 10. Implementation Notes

- **~3 files to create**, ~2 files to modify. Estimated complexity: medium (1 session).
- No backend changes. Pure frontend React + Ant Design work.
- FormBuilder is a controlled component (`value`/`onChange` string props) — standard Ant Design pattern for custom Form.Item children.
- Reuse Ant Design components: Card, Input, Select (tag mode for options), Switch, Button, Popconfirm, Space, Typography.
