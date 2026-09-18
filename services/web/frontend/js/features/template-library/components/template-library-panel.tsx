import React, { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Form } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import getMeta from '@/utils/meta'
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplates,
  TemplateSnippet,
  TemplateSnippetInput,
  updateTemplate,
} from '../util/api'
import { relevanceScore } from '../util/search'
import { getUserFacingMessage } from '../../../infrastructure/fetch-json'

const emptyDraft: TemplateSnippetInput = {
  title: '',
  description: '',
  content: '',
  categories: [],
}

export default function TemplateLibraryPanel() {
  const { t } = useTranslation()
  const isAnonymous = getMeta('ol-anonymous')
  const [templates, setTemplates] = useState<TemplateSnippet[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TemplateSnippetInput | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const load = async () => {
    try {
      setTemplates(await getTemplates())
    } catch (e) {
      setError(getUserFacingMessage(e) || 'Unable to load templates.')
    }
  }

  useEffect(() => {
    if (!isAnonymous) void load()
  }, [isAnonymous])

  const allCategories = useMemo(
    () => [...new Set(templates.flatMap(t => t.categories))].sort((a, b) => a.localeCompare(b)),
    [templates]
  )

  const results = useMemo(() => {
    const filtered = templates.filter(template =>
      selectedCategories.every(category => template.categories.includes(category))
    )
    return filtered
      .map(template => ({ template, score: relevanceScore(template, search) }))
      .filter(({ score }) => !search.trim() || score > 0)
      .sort((a, b) => b.score - a.score || a.template.title.localeCompare(b.template.title))
      .map(({ template }) => template)
  }, [templates, search, selectedCategories])

  const startCreate = () => {
    setEditingId(null)
    setDraft({ ...emptyDraft, categories: [] })
    setNewCategory('')
    setError(undefined)
  }

  const startEdit = (template: TemplateSnippet) => {
    setEditingId(template.id)
    setDraft({
      title: template.title,
      description: template.description,
      content: template.content,
      categories: [...template.categories],
    })
    setNewCategory('')
    setError(undefined)
  }

  const addCategory = (value: string) => {
    const category = value.trim()
    if (!category || draft?.categories.includes(category)) return
    setDraft(current =>
      current ? { ...current, categories: [...current.categories, category] } : current
    )
    setNewCategory('')
  }

  const removeCategory = (category: string) => {
    setDraft(current =>
      current ? { ...current, categories: current.categories.filter(item => item !== category) } : current
    )
  }

  const cancel = () => {
    setEditingId(null)
    setDraft(null)
    setNewCategory('')
  }

  const save = async () => {
    if (!draft?.title.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const saved = editingId
        ? await updateTemplate(editingId, draft)
        : await createTemplate(draft)
      setTemplates(current =>
        editingId ? current.map(t => (t.id === saved.id ? saved : t)) : [saved, ...current]
      )
      cancel()
    } catch (e) {
      setError(getUserFacingMessage(e) || 'Unable to save template.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (template: TemplateSnippet) => {
    if (!window.confirm(`Delete template "${template.title}"?`)) return
    setBusy(true)
    setError(undefined)
    try {
      await deleteTemplate(template.id)
      setTemplates(current => current.filter(t => t.id !== template.id))
      if (editingId === template.id) cancel()
    } catch (e) {
      setError(getUserFacingMessage(e) || 'Unable to delete template.')
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (template: TemplateSnippet) => {
    setBusy(true)
    setError(undefined)
    try {
      setTemplates(current => [await duplicateTemplate(template.id), ...current])
    } catch (e) {
      setError(getUserFacingMessage(e) || 'Unable to duplicate template.')
    } finally {
      setBusy(false)
    }
  }

  const insert = (template: TemplateSnippet) => {
    window.dispatchEvent(
      new CustomEvent('ui:insert-template', {
        detail: { content: template.content },
      })
    )
  }

  const categories = (values: string[]) => (
    <div className="d-flex flex-wrap gap-1 mt-1">
      {values.map(value => (
        <span className="badge bg-secondary" key={value}>{value}</span>
      ))}
    </div>
  )

  if (isAnonymous) return null

  if (draft) {
    return (
      <div className="h-100 d-flex flex-column">
        <RailPanelHeader
          title={editingId ? `Edit ${t('template')}` : `New ${t('template')}`}
          actions={<Button variant="link" size="sm" onClick={cancel} disabled={busy}>{t('cancel')}</Button>}
        />
        <div className="overflow-auto p-3">
          <Form.Group className="mb-3">
            <Form.Label>{t('title')}</Form.Label>
            <Form.Control value={draft.title} onChange={e => setDraft(d => d && ({ ...d, title: e.target.value }))} autoFocus />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t('description')}</Form.Label>
            <Form.Control as="textarea" rows={3} value={draft.description} onChange={e => setDraft(d => d && ({ ...d, description: e.target.value }))} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t('categories')}</Form.Label>
            <div className="d-flex gap-2 mb-2">
              <Form.Control
                value={newCategory}
                placeholder="New category"
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addCategory(newCategory)
                  }
                }}
              />
              <Dropdown autoClose="outside">
                <Dropdown.Toggle size="sm" variant="outline-secondary">Existing</Dropdown.Toggle>
                <Dropdown.Menu style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {allCategories.length === 0
                    ? <Dropdown.Item disabled>No existing categories</Dropdown.Item>
                    : allCategories.map(category => (
                        <Dropdown.Item key={category} onClick={() => addCategory(category)}>{category}</Dropdown.Item>
                      ))}
                </Dropdown.Menu>
              </Dropdown>
            </div>
            {categories(draft.categories)}
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>LaTeX</Form.Label>
            <Form.Control as="textarea" rows={18} value={draft.content} onChange={e => setDraft(d => d && ({ ...d, content: e.target.value }))} spellCheck={false} className="font-monospace" />
          </Form.Group>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="d-flex justify-content-end">
            <Button onClick={save} disabled={busy || !draft.title.trim()}>{busy ? 'Saving…' : t('save')}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-100 d-flex flex-column">
      <RailPanelHeader title={t('templates')} actions={<Button variant="primary" size="sm" onClick={startCreate}>{t('new')}</Button>} />
      <div className="p-2 border-bottom">
        <Form.Control type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…" aria-label="Search templates" />
        <Dropdown autoClose="outside" className="mt-2">
          <Dropdown.Toggle variant="outline-secondary" size="sm">
            {selectedCategories.length ? `Categories (${selectedCategories.length})` : t('categories')}
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ maxHeight: 260, overflowY: 'auto' }}>
            {allCategories.length === 0
              ? <Dropdown.Item disabled>No categories</Dropdown.Item>
              : allCategories.map(category => (
                  <Form.Check
                    key={category}
                    type="checkbox"
                    className="px-3 py-1"
                    label={category}
                    checked={selectedCategories.includes(category)}
                    onChange={e => setSelectedCategories(current => e.target.checked ? [...current, category] : current.filter(c => c !== category))}
                  />
                ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <div className="overflow-auto flex-grow-1 p-2">
        {error && <div className="alert alert-danger">{error}</div>}
        {results.length === 0
          ? <div className="text-muted small p-2">No matching templates.</div>
          : results.map(template => (
              <div className="border rounded p-2 mb-2" key={template.id}>
                <div className="fw-semibold">{template.title}</div>
                {template.description && <div className="text-muted small mt-1">{template.description}</div>}
                {categories(template.categories)}
                <div className="d-flex flex-wrap gap-1 mt-2">
                  <Button size="sm" onClick={() => insert(template)}>{t('insert')}</Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => startEdit(template)}>{t('edit')}</Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => duplicate(template)}>{t('duplicate')}</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => remove(template)}>{t('delete')}</Button>
                </div>
              </div>
            ))}
      </div>
    </div>
  )
}
