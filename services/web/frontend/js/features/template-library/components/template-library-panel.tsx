import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import '../template-library-panel.scss'
import { Button, ButtonGroup, Dropdown, Form, Modal } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLButton from '@/shared/components/ol/ol-button'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import getMeta from '@/utils/meta'
import { getUserFacingMessage } from '../../../infrastructure/fetch-json'
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplates,
  TemplateSnippet,
  TemplateSnippetInput,
  TemplateLibraryExport,
  TemplateLibraryImportResult,
  importTemplates,
  updateTemplate,
} from '../util/api'
import { relevanceScore } from '../util/search'

const EMPTY_DRAFT: TemplateSnippetInput = {
  title: '',
  description: '',
  content: '',
  categories: [],
}

type ImportPreview = {
  fileName: string
  payload: TemplateLibraryExport
  total: number
  added: number
  replaced: number
  skipped: number
}

export default function TemplateLibraryPanel() {
  const { t } = useTranslation()
  const anonymous = getMeta('ol-anonymous')

  const [templates, setTemplates] = useState<TemplateSnippet[]>([])
  const [query, setQuery] = useState('')
  const [categoriesFilter, setCategoriesFilter] = useState<string[]>([])
  const [draft, setDraft] = useState<TemplateSnippetInput | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [categoryInput, setCategoryInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null
  )
  const [importResult, setImportResult] =
    useState<TemplateLibraryImportResult | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (anonymous) return

    getTemplates()
      .then(setTemplates)
      .catch(error => {
        setError(getUserFacingMessage(error) || 'Unable to load templates.')
      })
  }, [anonymous])

  const availableCategories = useMemo(() => {
    const values = new Set<string>()

    templates.forEach(template => {
      template.categories.forEach(category => values.add(category))
    })

    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [templates])

  const filteredTemplates = useMemo(() => {
    const withCategories = templates.filter(template =>
      categoriesFilter.every(category =>
        template.categories.includes(category)
      )
    )

    const normalizedQuery = query.trim()
    if (!normalizedQuery) return withCategories

    return withCategories
      .map(template => ({
        template,
        score: relevanceScore(template, normalizedQuery),
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return a.template.title.localeCompare(b.template.title)
      })
      .map(result => result.template)
  }, [templates, query, categoriesFilter])


  const exportTemplates = async () => {
    setBusy(true)
    setError('')
    setImportResult(null)

    try {
      const allTemplates = await getTemplates()
      setTemplates(allTemplates)

      const payload: TemplateLibraryExport = {
        version: 1,
        exportedAt: new Date().toISOString(),
        templates: allTemplates,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const date = new Date().toISOString().slice(0, 10)
      link.download = `overleaf-template-library-${date}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(
        getUserFacingMessage(exportError) || 'Unable to export templates.'
      )
    } finally {
      setBusy(false)
    }
  }

  const parseImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setError('')
    setImportResult(null)

    try {
      const parsed = JSON.parse(await file.text()) as Partial<TemplateLibraryExport>

      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.templates) ||
        typeof parsed.exportedAt !== 'string'
      ) {
        throw new Error('This is not a valid template library export.')
      }

      const validTemplates = parsed.templates.every(template => {
        if (!template || typeof template !== 'object') return false

        const candidate = template as Partial<TemplateSnippet>
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.title === 'string' &&
          typeof candidate.description === 'string' &&
          typeof candidate.content === 'string' &&
          Array.isArray(candidate.categories) &&
          candidate.categories.every(category => typeof category === 'string') &&
          typeof candidate.createdAt === 'string' &&
          typeof candidate.updatedAt === 'string' &&
          Number.isFinite(Date.parse(candidate.createdAt)) &&
          Number.isFinite(Date.parse(candidate.updatedAt))
        )
      })

      if (!validTemplates) {
        throw new Error('This is not a valid template library export.')
      }

      const payload = parsed as TemplateLibraryExport
      const latestTemplates = await getTemplates()
      setTemplates(latestTemplates)

      const currentById = new Map(
        latestTemplates.map(template => [template.id, template])
      )
      const latestImportedById = new Map<string, TemplateSnippet>()

      for (const template of payload.templates) {
        const previous = latestImportedById.get(template.id)
        if (
          !previous ||
          new Date(template.updatedAt).getTime() >
            new Date(previous.updatedAt).getTime()
        ) {
          latestImportedById.set(template.id, template)
        }
      }

      let added = 0
      let replaced = 0
      let skipped = 0

      for (const template of latestImportedById.values()) {
        const current = currentById.get(template.id)

        if (!current) {
          added++
        } else if (
          new Date(template.updatedAt).getTime() >
          new Date(current.updatedAt).getTime()
        ) {
          replaced++
        } else {
          skipped++
        }
      }

      setImportPreview({
        fileName: file.name,
        payload: {
          ...payload,
          templates: Array.from(latestImportedById.values()),
        },
        total: latestImportedById.size,
        added,
        replaced,
        skipped,
      })
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'Unable to read template import.'
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return

    setBusy(true)
    setError('')

    try {
      const result = await importTemplates(importPreview.payload)
      const latestTemplates = await getTemplates()
      setTemplates(latestTemplates)
      setImportPreview(null)
      setImportResult(result)
      window.dispatchEvent(new CustomEvent('ui:templates-changed'))
    } catch (importError) {
      setError(
        getUserFacingMessage(importError) || 'Unable to import templates.'
      )
    } finally {
      setBusy(false)
    }
  }

  const closeEditor = () => {
    setDraft(null)
    setEditingId(null)
    setCategoryInput('')
  }

  const startCreate = () => {
    setError('')
    setEditingId(null)
    setCategoryInput('')
    setDraft({
      title: EMPTY_DRAFT.title,
      description: EMPTY_DRAFT.description,
      content: EMPTY_DRAFT.content,
      categories: [],
    })
  }

  const startEdit = (template: TemplateSnippet) => {
    setError('')
    setEditingId(template.id)
    setCategoryInput('')
    setDraft({
      title: template.title,
      description: template.description,
      content: template.content,
      categories: template.categories.slice(),
    })
  }

  const addCategory = () => {
    const value = categoryInput.trim()
    if (!draft || !value) return
    if (draft.categories.includes(value)) return

    setDraft({
      ...draft,
      categories: draft.categories.concat(value),
    })
    setCategoryInput('')
  }

  const removeCategory = (category: string) => {
    if (!draft) return

    setDraft({
      ...draft,
      categories: draft.categories.filter(value => value !== category),
    })
  }

  const save = async (action: 'save' | 'insert' | 'insert-link' = 'save') => {
    if (!draft || !draft.title.trim()) return

    setBusy(true)
    setError('')

    try {
      const saved = editingId
        ? await updateTemplate(editingId, draft)
        : await createTemplate(draft)

      window.dispatchEvent(new CustomEvent('ui:templates-changed'))

      if (editingId) {
        setTemplates(current =>
          current.map(template =>
            template.id === saved.id ? saved : template
          )
        )
      } else {
        setTemplates(current => [saved, ...current])
      }

      if (action === 'insert') {
        insertContent(saved.content)
      } else if (action === 'insert-link') {
        window.dispatchEvent(
          new CustomEvent('ui:insert-template-link', {
            detail: {
              content:
                '%% template: [' +
                saved.categories.join(',') +
                '] ' +
                saved.title,
            },
          })
        )
      }

      closeEditor()
    } catch (saveError) {
      setError(getUserFacingMessage(saveError) || 'Unable to save template.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (template: TemplateSnippet) => {
    const confirmed = window.confirm(
      'Delete template "' + template.title + '"?'
    )
    if (!confirmed) return

    setBusy(true)
    setError('')

    try {
      await deleteTemplate(template.id)
      setTemplates(current =>
        current.filter(currentTemplate => currentTemplate.id !== template.id)
      )
      window.dispatchEvent(new CustomEvent('ui:templates-changed'))

      if (editingId === template.id) {
        closeEditor()
      }
    } catch (removeError) {
      setError(getUserFacingMessage(removeError) || 'Unable to delete template.')
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (template: TemplateSnippet) => {
    setBusy(true)
    setError('')

    try {
      const copy = await duplicateTemplate(template.id)
      setTemplates(current => [copy, ...current])
      window.dispatchEvent(new CustomEvent('ui:templates-changed'))
    } catch (duplicateError) {
      setError(
        getUserFacingMessage(duplicateError) || 'Unable to duplicate template.'
      )
    } finally {
      setBusy(false)
    }
  }

  const insertContent = (content: string) => {
    window.dispatchEvent(
      new CustomEvent('ui:insert-template', {
        detail: { content },
      })
    )
  }

  const insert = (template: TemplateSnippet) => {
    insertContent(template.content)
  }

  if (anonymous) return null

  if (draft) {
    return (
      <div className="h-100 d-flex flex-column template-library-panel">
        <div className="rail-panel-header">
          <h4 className="rail-panel-title">
            {editingId ? 'Edit ' + t('template') : 'New ' + t('template')}
          </h4>
          <div className="rail-panel-header-actions">
            <OLIconButton
              onClick={closeEditor}
              className="rail-panel-header-button-subdued template-library-editor-close"
              icon="close"
              accessibilityLabel={t('close')}
              size="sm"
            />
          </div>
        </div>

        <div className="overflow-auto p-3 template-library-form">
          <Form.Group className="mb-3">
            <Form.Label>{t('title')}</Form.Label>
            <Form.Control
              autoFocus
              size="sm"
              value={draft.title}
              placeholder="Template title"
              onChange={event =>
                setDraft({
                  ...draft,
                  title: event.target.value,
                })
              }
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>{t('description')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              size="sm"
              value={draft.description}
              placeholder="Describe what this template is for"
              onChange={event =>
                setDraft({
                  ...draft,
                  description: event.target.value,
                })
              }
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="template-library-field-label">{t('Categories')}</Form.Label>
            <div className="d-flex gap-2 mb-2">
              <Form.Control
                size="sm"
                value={categoryInput}
                placeholder="New category"
                onChange={event => setCategoryInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault()
                    addCategory()
                  }
                }}
              />

              <Dropdown
                autoClose="outside"
                as={ButtonGroup}
                className="template-library-category-action"
              >
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={addCategory}
                  disabled={!categoryInput.trim() || busy}
                >
                  Add
                </Button>
                <Dropdown.Toggle
                  split
                  size="sm"
                  variant="outline-secondary"
                  aria-label="Existing categories"
                />
                <Dropdown.Menu align="end">
                  {availableCategories.length === 0 ? (
                    <Dropdown.Item disabled>
                      No existing categories
                    </Dropdown.Item>
                  ) : (
                    availableCategories.map(category => (
                      <Dropdown.Item
                        key={category}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            categories: draft.categories.includes(category)
                              ? draft.categories.filter(value => value !== category)
                              : draft.categories.concat(category),
                          })
                        }}
                      >
                        <span
                          className="material-symbols template-library-category-menu-check"
                          aria-hidden="true"
                          translate="no"
                        >
                          {draft.categories.includes(category) ? 'check' : ''}
                        </span>
                        <span>{category}</span>
                      </Dropdown.Item>
                    ))
                  )}
                </Dropdown.Menu>
              </Dropdown>
            </div>

            <div className="template-library-category-list" aria-live="polite">
              {draft.categories.map(category => (
                <span className="template-library-category" key={category}>
                  <span>{category}</span>
                  <button
                    type="button"
                    className="template-library-category-remove"
                    onClick={() => removeCategory(category)}
                    disabled={busy}
                    aria-label={`Remove ${category}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>LaTeX</Form.Label>
            <Form.Control
              as="textarea"
              rows={18}
              value={draft.content}
              placeholder="Enter LaTeX content for this template"
              onChange={event =>
                setDraft({
                  ...draft,
                  content: event.target.value,
                })
              }
              spellCheck={false}
              className="font-monospace"
            />
          </Form.Group>

          {error && <div className="alert alert-danger">{error}</div>}

          <div className="template-library-form-actions">
            <Dropdown
              autoClose="outside"
              as={ButtonGroup}
              className="template-library-save-action"
            >
              <Button
                variant="success"
                size="sm"
                onClick={() => save()}
                disabled={busy || !draft.title.trim()}
              >
                {busy ? 'Saving…' : t('save')}
              </Button>
              <Dropdown.Toggle
                split
                variant="success"
                size="sm"
                aria-label="Save options"
                disabled={busy || !draft.title.trim()}
              />
              <Dropdown.Menu align="end">
                <Dropdown.Item
                  onClick={() => save('insert')}
                  disabled={busy || !draft.content.trim()}
                >
                  {t('insert')}
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => save('insert-link')}
                  disabled={
                    busy || !draft.title.trim()
                  }
                >
                  Insert Link
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-100 d-flex flex-column">
      <RailPanelHeader
        title={t('templates')}
      />

      <div className="border-bottom template-library-toolbar">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="d-none"
          onChange={parseImportFile}
        />

        <div className="template-library-search-row">
          <Form.Control
            className="template-library-search-input"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search all templates..."
            aria-label="Search templates"
            size="sm"
          />

          <Dropdown
            autoClose="outside"
            as={ButtonGroup}
            className="template-library-search-action"
          >
            <Button
              variant="success"
              size="sm"
              onClick={() => setQuery(query.trim())}
            >
              Search
            </Button>
            <Dropdown.Toggle
              split
              variant="success"
              size="sm"
              aria-label="Search options"
            />
            <Dropdown.Menu align="end">
              <Dropdown.Item onClick={startCreate}>
                {t('new')}
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() => importInputRef.current?.click()}
                disabled={busy}
              >
                Import Templates
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() => void exportTemplates()}
                disabled={busy}
              >
                Export Templates
              </Dropdown.Item>

              <Dropdown.Divider />

              <Dropdown.Header>{t('Categories')}</Dropdown.Header>

              {availableCategories.length === 0 ? (
                <Dropdown.Item disabled>No categories</Dropdown.Item>
              ) : (
                availableCategories.map(category => (
                  <label
                    key={category}
                    className="template-library-category-check dropdown-item"
                  >
                    <input
                      autoComplete="off"
                      aria-label={`Select ${category}`}
                      type="checkbox"
                      className="visually-hidden"
                      checked={categoriesFilter.includes(category)}
                      onChange={event => {
                        if (event.target.checked) {
                          setCategoriesFilter(current =>
                            current.includes(category)
                              ? current
                              : current.concat(category)
                          )
                        } else {
                          setCategoriesFilter(current =>
                            current.filter(value => value !== category)
                          )
                        }
                      }}
                    />
                    <span
                      className="material-symbols template-library-category-checkmark"
                      aria-hidden="true"
                      translate="no"
                    >
                      {categoriesFilter.includes(category) ? 'check' : ''}
                    </span>
                    <span>{category}</span>
                  </label>
                ))
              )}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>

      {importResult && (
        <div className="px-3 pt-2 template-library-import-result">
          <div className="alert alert-success mb-0">
            Imported {importResult.total} templates: {importResult.added} added,{' '}
            {importResult.replaced} replaced, {importResult.skipped} skipped.
          </div>
        </div>
      )}

      <div className="overflow-auto flex-grow-1 p-3 template-library-list">
        {error && <div className="alert alert-danger">{error}</div>}

        {filteredTemplates.length === 0 ? (
          <div className="text-muted small p-2">
            No matching templates.
          </div>
        ) : (
          filteredTemplates.map(template => (
            <div className="template-library-item mb-3 p-3" key={template.id}>
              <div className="template-library-card-row">
                <div
                  className="template-library-title text-truncate"
                  title={template.description || template.title}
                >
                  {template.title}
                </div>

                <Dropdown as={ButtonGroup} className="template-library-card-action">
                  <Button
                    size="sm"
                    variant="success"
                    className="template-library-insert"
                    onClick={() => insert(template)}
                  >
                    {t('insert')}
                  </Button>
                  <Dropdown.Toggle
                    split
                    size="sm"
                    variant="success"
                    className="template-library-action-toggle"
                    aria-label="Template actions"
                  />
                  <Dropdown.Menu align="end">
                    <Dropdown.Item onClick={() => startEdit(template)}>
                      {t('edit')}
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => duplicate(template)}>
                      Duplicate
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('ui:insert-template-link', {
                            detail: {
                              content:
                                '%% template: [' +
                                template.categories.join(',') +
                                '] ' +
                                template.title,
                            },
                          })
                        )
                      }}
                    >
                      Insert Link
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      className="template-library-delete-item"
                      onClick={() => remove(template)}
                    >
                      {t('delete')}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  )
}

      <Modal
        show={Boolean(importPreview)}
        onHide={() => {
          if (!busy) setImportPreview(null)
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Import templates</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {importPreview && (
            <>
              <div className="small text-muted mb-3">
                {importPreview.fileName}
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Templates found</span>
                <strong>{importPreview.total}</strong>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>New templates</span>
                <strong>{importPreview.added}</strong>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Will be replaced</span>
                <strong>{importPreview.replaced}</strong>
              </div>
              <div className="d-flex justify-content-between">
                <span>Already newer</span>
                <strong>{importPreview.skipped}</strong>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setImportPreview(null)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={() => void confirmImport()}
            disabled={busy}
          >
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </Modal.Footer>
      </Modal>
