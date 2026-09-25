import { deleteJSON, getJSON, postJSON, putJSON } from '../../../infrastructure/fetch-json'

export type TemplateSnippet = {
  id: string
  title: string
  description: string
  content: string
  categories: string[]
  createdAt: string
  updatedAt: string
}

export type TemplateSnippetInput = {
  title: string
  description: string
  content: string
  categories: string[]
}

export type TemplateLibraryExport = {
  version: 1
  exportedAt: string
  templates: TemplateSnippet[]
}

export type TemplateLibraryImportResult = {
  total: number
  added: number
  replaced: number
  skipped: number
}

export const getTemplates = () =>
  getJSON<TemplateSnippet[]>('/template-library/templates')

export const createTemplate = (body: TemplateSnippetInput) =>
  postJSON<TemplateSnippet>('/template-library/templates', { body })

export const updateTemplate = (
  templateId: string,
  body: TemplateSnippetInput
) =>
  putJSON<TemplateSnippet>(`/template-library/templates/${templateId}`, {
    body,
  })

export const deleteTemplate = (templateId: string) =>
  deleteJSON(`/template-library/templates/${templateId}`)

export const duplicateTemplate = (templateId: string) =>
  postJSON<TemplateSnippet>(
    `/template-library/templates/${templateId}/duplicate`
  )

export const importTemplates = (body: TemplateLibraryExport) =>
  postJSON<TemplateLibraryImportResult>('/template-library/templates/import', {
    body,
  })
