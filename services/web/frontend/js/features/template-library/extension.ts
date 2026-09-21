import { RangeSet, RangeSetBuilder } from '@codemirror/state'
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  gutter,
} from '@codemirror/view'
import { getTemplates, TemplateSnippet } from './util/api'
import { relevanceScore } from './util/search'

const TEMPLATE_MARKER_RE = /^\s*%%\s*template:\s*\[([^\]]*)\]\s*(.*?)\s*$/

type TemplateMatch = {
  lineFrom: number
  template: TemplateSnippet
}

function parseTemplateMarker(lineText: string) {
  const match = lineText.match(TEMPLATE_MARKER_RE)
  if (!match) return null

  const categories = match[1]
    .split(',')
    .map(category => category.trim().toLocaleLowerCase())
    .filter(Boolean)

  const query = match[2].trim()
  if (!categories.length || !query) return null

  return { categories, query }
}

function findTemplateMatch(
  templates: TemplateSnippet[],
  lineText: string
): TemplateSnippet | null {
  const marker = parseTemplateMarker(lineText)
  if (!marker) return null

  const matches = templates
    .filter(template =>
      marker.categories.every(category =>
        template.categories.some(
          templateCategory =>
            templateCategory.trim().toLocaleLowerCase() === category
        )
      )
    )
    .map(template => ({
      template,
      score: relevanceScore(template, marker.query),
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return a.template.title.localeCompare(b.template.title)
    })

  return matches.length === 1 ? matches[0].template : null
}

class TemplateMarker extends GutterMarker {
  constructor(
    private readonly template: TemplateSnippet,
    private readonly checked: boolean
  ) {
    super()
  }

  eq(other: TemplateMarker) {
    return (
      this.template.id === other.template.id && this.checked === other.checked
    )
  }

  toDOM() {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ol-cm-template-marker' + (this.checked ? ' is-checked' : '')
    button.title = this.checked
      ? 'Template inserted'
      : 'Insert template: ' + this.template.title
    button.setAttribute('aria-label', button.title)
    button.setAttribute('aria-pressed', String(this.checked))

    const icon = document.createElement('span')
    icon.className = 'material-symbols'
    icon.setAttribute('aria-hidden', 'true')
    icon.setAttribute('translate', 'no')
    icon.textContent = this.checked ? 'check_box' : 'check_box_outline_blank'

    button.append(icon)
    return button
  }
}

class TemplateMarkerPlugin {
  templates: TemplateSnippet[] = []
  checkedPositions = new Set<number>()

  constructor(private readonly view: EditorView) {
    void this.refreshTemplates()
    window.addEventListener('ui:templates-changed', this.refreshTemplates)
  }

  destroy() {
    window.removeEventListener('ui:templates-changed', this.refreshTemplates)
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      const mapped = new Set<number>()

      for (const position of this.checkedPositions) {
        mapped.add(update.changes.mapPos(position))
      }

      this.checkedPositions = mapped
      this.pruneCheckedPositions(update.view)
    }
  }

  async refreshTemplates() {
    try {
      this.templates = await getTemplates()
      this.pruneCheckedPositions(this.view)
      this.view.requestMeasure()
    } catch {
      // Template markers are an optional enhancement. Ignore unavailable templates.
    }
  }

  pruneCheckedPositions(view: EditorView) {
    const validPositions = new Set<number>()

    for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber++) {
      const line = view.state.doc.line(lineNumber)
      if (parseTemplateMarker(line.text)) {
        validPositions.add(line.from)
      }
    }

    this.checkedPositions = new Set(
      [...this.checkedPositions].filter(position =>
        validPositions.has(position)
      )
    )
  }

  getMatch(lineFrom: number): TemplateMatch | null {
    const line = this.view.state.doc.lineAt(lineFrom)
    const template = findTemplateMatch(this.templates, line.text)
    if (!template) return null

    return {
      lineFrom,
      template,
    }
  }

  markers() {
    const builder = new RangeSetBuilder<TemplateMarker>()

    for (let lineNumber = 1; lineNumber <= this.view.state.doc.lines; lineNumber++) {
      const line = this.view.state.doc.line(lineNumber)
      const template = findTemplateMatch(this.templates, line.text)
      if (!template) continue

      builder.add(
        line.from,
        line.from,
        new TemplateMarker(
          template,
          this.checkedPositions.has(line.from)
        )
      )
    }

    return builder.finish()
  }

  insert(templateMatch: TemplateMatch) {
    const line = this.view.state.doc.lineAt(templateMatch.lineFrom)
    const content = templateMatch.template.content.replace(/\s+$/, '')
    if (!content) return

    const insertion = '\\n' + content + '\\n'

    this.view.dispatch({
      changes: {
        from: line.to,
        to: line.to,
        insert: insertion,
      },
    })

    this.checkedPositions.add(line.from)
    this.view.requestMeasure()
    this.view.focus()
  }
}

const templateMarkerPlugin = ViewPlugin.fromClass(TemplateMarkerPlugin)

const templateMarkerGutter = gutter({
  class: 'ol-cm-template-gutter',
  markers(view) {
    return view.plugin(templateMarkerPlugin)?.markers() ?? RangeSet.empty
  },
  domEventHandlers: {
    mousedown(view, line, event) {
      const target = event.target as HTMLElement
      if (!target.closest('.ol-cm-template-marker')) return false

      const plugin = view.plugin(templateMarkerPlugin)
      if (!plugin) return false

      const match = plugin.getMatch(line.from)
      if (!match) return false

      event.preventDefault()
      event.stopPropagation()
      plugin.insert(match)
      return true
    },
  },
})

const templateMarkerTheme = EditorView.baseTheme({
  '.ol-cm-template-gutter': {
    order: '-2',
    minWidth: '24px',
  },
  '.ol-cm-template-marker': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '100%',
    padding: '0',
    border: '0',
    background: 'transparent',
    color: 'var(--content-color-secondary)',
    cursor: 'pointer',
    opacity: '0.75',
  },
  '.ol-cm-template-marker.is-checked': {\n    color: 'var(--success-color, #198754)',\n    opacity: '1',\n  },\n  '.ol-cm-template-marker:hover': {
    color: 'var(--link-color-themed)',
    opacity: '1',
  },
  '.ol-cm-template-marker .material-symbols': {
    fontSize: '18px',
    lineHeight: '18px',
  },
})

export const templateInsertion = () => [
  ViewPlugin.define(view => {
    const handler = (event: Event) => {
      const content = (event as CustomEvent<{ content?: unknown }>).detail
        ?.content
      if (typeof content !== 'string' || !view.dom.isConnected) return
      view.dispatch(view.state.replaceSelection(content))
      view.focus()
    }

    window.addEventListener('ui:insert-template', handler)
    return {
      destroy() {
        window.removeEventListener('ui:insert-template', handler)
      },
    }
  }),
  templateMarkerPlugin,
  templateMarkerGutter,
  templateMarkerTheme,
]
