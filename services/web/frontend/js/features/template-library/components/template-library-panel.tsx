import { useEffect, useMemo, useState } from 'react'
import '../template-library-panel.scss'
import { Button, Dropdown, Form } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import getMeta from '@/utils/meta'
import { getUserFacingMessage } from '../../../infrastructure/fetch-json'
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

const EMPTY_DRAFT: TemplateSnippetInput = {
  title: '',
  description: '',
  content: '',
  categories: [],
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

  const save = async () => {
    if (!draft || !draft.title.trim()) return

    setBusy(true)
    setError('')

    try {
      const saved = editingId
        ? await updateTemplate(editingId, draft)
        : await createTemplate(draft)

      if (editingId) {
        setTemplates(current =>
          current.map(template =>
            template.id === saved.id ? saved : template
          )
        )
      } else {
        setTemplates(current => [saved, ...current])
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

  const renderCategories = (values: string[]) => (
    <div className="d-flex flex-wrap gap-1 mt-1">
      {values.map(value => (
        <span className="badge bg-secondary" key={value}>
          {value}
        </span>
      ))}
    </div>
  )

  if (anonymous) return null

  if (draft) {
    return (
      <div className="h-100 d-flex flex-column template-library-panel">
        <RailPanelHeader
          title={editingId ? 'Edit ' + t('template') : 'New ' + t('template')}
          actions={
            <Button
              variant="link"
              size="sm"
              onClick={closeEditor}
              disabled={busy}
            >
              {t('cancel')}
            </Button>
          }
        />

        <div className="overflow-auto p-3 template-library-form">
          <Form.Group className="mb-3">
            <Form.Label>{t('title')}</Form.Label>
            <Form.Control
              autoFocus
              value={draft.title}
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
              value={draft.description}
              onChange={event =>
                setDraft({
                  ...draft,
                  description: event.target.value,
                })
              }
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label className="template-library-field-label">{t('categories')}</Form.Label>
            <div className="d-flex gap-2 mb-2">
              <Form.Control
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

              <Dropdown autoClose="outside">
                <Dropdown.Toggle
                  size="sm"
                  variant="outline-secondary"
                >
                  Existing
                </Dropdown.Toggle>

                <Dropdown.Menu
                  style={{ maxHeight: 240, overflowY: 'auto' }}
                >
                  {availableCategories.length === 0 ? (
                    <Dropdown.Item disabled>
                      No existing categories
                    </Dropdown.Item>
                  ) : (
                    availableCategories.map(category => (
                      <Dropdown.Item
                        key={category}
                        onClick={() => {
                          if (!draft.categories.includes(category)) {
                            setDraft({
                              ...draft,
                              categories: draft.categories.concat(category),
                            })
                          }
                        }}
                      >
                        {category}
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
            <Button
              variant="outline-secondary"
              onClick={closeEditor}
              disabled={busy}
            >
              {t('cancel')}
            </Button>
            <div className="d-flex gap-2">
              <Button
                variant="outline-primary"
                onClick={() => {
                  insertContent(draft.content)
                  closeEditor()
                }}
                disabled={busy || !draft.content.trim()}
              >
                {t('insert')}
              </Button>
              <Button
                onClick={() => save()}
                disabled={busy || !draft.title.trim()}
              >
                {busy ? 'Saving…' : t('save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-100 d-flex flex-column">
      <RailPanelHeader
        title={t('templates')}
        actions={
          <Button variant="primary" size="sm" onClick={startCreate}>
            {t('new')}
          </Button>
        }
      />

      <div className="p-3 border-bottom template-library-toolbar">
        <Form.Control
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search templates"
          aria-label="Search templates"
        />

        <Dropdown autoClose="outside" className="mt-2">
          <Dropdown.Toggle variant="outline-secondary" size="sm">
            {categoriesFilter.length > 0
              ? 'Categories (' + categoriesFilter.length + ')'
              : t('categories')}
          </Dropdown.Toggle>

          <Dropdown.Menu
            style={{ maxHeight: 260, overflowY: 'auto' }}
          >
            {availableCategories.length === 0 ? (
              <Dropdown.Item disabled>No categories</Dropdown.Item>
            ) : (
              availableCategories.map(category => (
                <Form.Check
                  key={category}
                  type="checkbox"
                  className="px-3 py-1"
                  label={category}
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
              ))
            )}
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <div className="overflow-auto flex-grow-1 p-3 template-library-list">
        {error && <div className="alert alert-danger">{error}</div>}

        {filteredTemplates.length === 0 ? (
          <div className="text-muted small p-2">
            No matching templates.
          </div>
        ) : (
          filteredTemplates.map(template => (
            <div className="template-library-item mb-3 p-3" key={template.id}>
              <div className="template-library-title text-truncate">{template.title}</div>

              {template.description && (
                <div className="template-library-description small mt-1">
                  {template.description}
                </div>
              )}

              {renderCategories(template.categories)}

              <div className="d-flex flex-wrap gap-2 mt-3">
                <Button size="sm" className="template-library-insert" onClick={() => insert(template)}>
                  {t('insert')}
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => startEdit(template)}
                >
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => duplicate(template)}
                >
                  {t('duplicate')}
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => remove(template)}
                >
                  {t('delete')}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
