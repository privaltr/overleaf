import { RangeSet, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  gutter,
} from '@codemirror/view'
import { getTemplates, TemplateSnippet } from './util/api'

const TEMPLATE_MARKER_RE = /^\s*%%\s*template:\s*\[([^\]]*)\]\s*(.*?)\s*$/

type TemplateMatch = {
  lineFrom: number
  template: TemplateSnippet
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function parseTemplateMarker(lineText: string) {
  const match = lineText.match(TEMPLATE_MARKER_RE)
  if (!match) return null

  const categories = match[1]
    .split(',')
    .map(category => normalize(category))
    .filter(Boolean)

  const query = normalize(match[2])
  if (!categories.length || !query) return null

  return { categories, query }
}

function findTemplateMatch(
  templates: TemplateSnippet[],
  lineText: string
): TemplateSnippet | null {
  const marker = parseTemplateMarker(lineText)
  if (!marker) return null

  const matches = templates.filter(template => {
    const hasAllCategories = marker.categories.every(category =>
      template.categories.some(
        templateCategory => normalize(templateCategory) === category
      )
    )

    return hasAllCategories && normalize(template.title) === marker.query
  })

  return matches.length === 1 ? matches[0] : null
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
    button.className =
      'ol-cm-template-marker' + (this.checked ? ' is-checked' : '')
    button.title = this.checked
      ? 'Template inserted'
      : 'Insert template: ' + this.template.title
    button.setAttribute('aria-label', button.title)

    const icon = document.createElement('span')
    icon.className = 'material-symbols'
    icon.setAttribute('aria-hidden', 'true')
    icon.setAttribute('translate', 'no')
    icon.textContent = this.checked
      ? 'check_box'
      : 'check_box_outline_blank'

    button.append(icon)
    return button
  }
}

const setTemplateMarkers = StateEffect.define<RangeSet<TemplateMarker>>()

const templateMarkerState = StateField.define<RangeSet<TemplateMarker>>({
  create() {
    return RangeSet.empty
  },
  update(markers, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTemplateMarkers)) {
        return effect.value
      }
    }

    if (transaction.docChanged) {
      return markers.map(transaction.changes)
    }

    return markers
  },
})

class TemplateMarkerPlugin {
  templates: TemplateSnippet[] = []
  checkedPositions = new Set<number>()

  constructor(private readonly view: EditorView) {
    this.handleTemplatesChanged = this.handleTemplatesChanged.bind(this)
    void this.refreshTemplates()
    window.addEventListener(
      'ui:templates-changed',
      this.handleTemplatesChanged
    )
  }

  destroy() {
    window.removeEventListener(
      'ui:templates-changed',
      this.handleTemplatesChanged
    )
  }

  update(update: ViewUpdate) {
    if (!update.docChanged) return

    const mapped = new Set<number>()
    for (const position of this.checkedPositions) {
      mapped.add(update.changes.mapPos(position))
    }

    this.checkedPositions = mapped
    this.pruneCheckedPositions(update.view)

    window.setTimeout(() => {
      if (this.view.dom.isConnected) {
        this.updateMarkers()
      }
    })
  }

  private handleTemplatesChanged() {
    void this.refreshTemplates()
  }

  private async refreshTemplates() {
    try {
      this.templates = await getTemplates()
      this.pruneCheckedPositions(this.view)
      this.updateMarkers()
    } catch {
      // Template markers are an optional enhancement. Ignore unavailable templates.
    }
  }

  private pruneCheckedPositions(view: EditorView) {
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

  private updateMarkers() {
    this.view.dispatch({
      effects: setTemplateMarkers.of(this.createMarkers()),
    })
  }

  private getMatch(lineFrom: number): TemplateMatch | null {
    const line = this.view.state.doc.lineAt(lineFrom)
    const template = findTemplateMatch(this.templates, line.text)
    if (!template) return null

    return {
      lineFrom,
      template,
    }
  }

  private createMarkers() {
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

  private insert(match: TemplateMatch) {
    const line = this.view.state.doc.lineAt(match.lineFrom)
    const content = match.template.content.replace(/\s+$/, '')
    if (!content) return

    this.checkedPositions.add(line.from)

    this.view.dispatch({
      changes: {
        from: line.to,
        to: line.to,
        insert: '\n' + content + '\n',
      },
    })

    this.updateMarkers()
    this.view.focus()
  }

  handleGutterMouseDown(event: MouseEvent, lineFrom: number) {
    const target = event.target as HTMLElement
    if (!target.closest('.ol-cm-template-marker')) return false

    const match = this.getMatch(lineFrom)
    if (!match) return false

    event.preventDefault()
    event.stopPropagation()
    this.insert(match)
    return true
  }
}

const templateMarkerPlugin = ViewPlugin.fromClass(TemplateMarkerPlugin)

const templateMarkerGutter = gutter({
  class: 'ol-cm-template-gutter',
  markers: view => view.state.field(templateMarkerState),
  renderEmptyElements: true,
  domEventHandlers: {
    mousedown(view, line, event) {
      return (
        view.plugin(templateMarkerPlugin)?.handleGutterMouseDown(
          event,
          line.from
        ) ?? false
      )
    },
  },
})

const templateMarkerTheme = EditorView.baseTheme({
  '.ol-cm-template-gutter': {
    order: -2,
    minWidth: '24px',
  },
  '.ol-cm-template-marker': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '100%',
    padding: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--content-color-secondary)',
    cursor: 'pointer',
    opacity: '0.75',
  },
  '.ol-cm-template-marker.is-checked': {
    color: 'var(--success-color, #198754)',
    opacity: '1',
  },
  '.ol-cm-template-marker:hover': {
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
  templateMarkerState,
  templateMarkerPlugin,
  templateMarkerGutter,
  templateMarkerTheme,
]
