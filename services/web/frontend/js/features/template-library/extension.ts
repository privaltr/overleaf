import { RangeSet, RangeSetBuilder } from '@codemirror/state'
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  gutter,
} from '@codemirror/view'
import { getTemplates, TemplateSnippet } from './util/api'

const TEMPLATE_MARKER_RE = /^\s*%%\s*(UNFOLDED\s+)?template:\s*\[([^\]]*)\]\s*(.*?)\s*$/i

type TemplateMatch = {
  lineFrom: number
  template: TemplateSnippet
  folded: boolean
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function parseTemplateMarker(lineText: string) {
  const match = lineText.match(TEMPLATE_MARKER_RE)
  if (!match) return null

  const unfolded = Boolean(match[1])
  const categories = match[2]
    .split(',')
    .map(category => normalize(category))
    .filter(Boolean)

  const query = normalize(match[3])
  if (!query) return null

  return { categories, query, folded: unfolded }
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

class TemplateMarkerPlugin {
  templates: TemplateSnippet[] = []

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

    window.setTimeout(() => {
      if (this.view.dom.isConnected) {
        this.view.dispatch({})
      }
    })
  }

  private handleTemplatesChanged() {
    void this.refreshTemplates()
  }

  private async refreshTemplates() {
    try {
      this.templates = await getTemplates()
      this.view.dispatch({})
    } catch {
      // Template markers are an optional enhancement. Ignore unavailable templates.
    }
  }

  private getMatch(lineFrom: number): TemplateMatch | null {
    const line = this.view.state.doc.lineAt(lineFrom)
    const template = findTemplateMatch(this.templates, line.text)
    if (!template) return null

    const marker = parseTemplateMarker(line.text)
    if (!marker) return null

    return {
      lineFrom,
      template,
      folded: marker.folded,
    }
  }

  private createMarkers() {
    const builder = new RangeSetBuilder<TemplateMarker>()

    for (
      let lineNumber = 1;
      lineNumber <= this.view.state.doc.lines;
      lineNumber++
    ) {
      const line = this.view.state.doc.line(lineNumber)
      const template = findTemplateMatch(this.templates, line.text)
      const marker = parseTemplateMarker(line.text)
      if (!template || !marker) continue

      builder.add(
        line.from,
        line.from,
        new TemplateMarker(template, marker.folded)
      )
    }

    return builder.finish()
  }

  private insert(match: TemplateMatch) {
    const line = this.view.state.doc.lineAt(match.lineFrom)
    if (match.folded) return

    const content = match.template.content.replace(/\s+$/, '')
    if (!content) return

    const markerLine = line.text.replace(
      /^(\s*%%\s*)template:/i,
      '$1UNFOLDED template:'
    )

    this.view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: markerLine + '\n' + content + '\n',
      },
    })

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

  markers() {
    return this.createMarkers()
  }
}

const templateMarkerPlugin = ViewPlugin.fromClass(TemplateMarkerPlugin)

const templateMarkerGutter = gutter({
  class: 'ol-cm-template-gutter',
  markers: view =>
    view.plugin(templateMarkerPlugin)?.markers() ?? RangeSet.empty,
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

    const linkHandler = (event: Event) => {
      const content = (event as CustomEvent<{ content?: unknown }>).detail
        ?.content

      if (typeof content !== 'string' || !view.dom.isConnected) return

      view.dispatch(view.state.replaceSelection(content))
      view.focus()
    }

    window.addEventListener('ui:insert-template', handler)
    window.addEventListener('ui:insert-template-link', linkHandler)

    return {
      destroy() {
        window.removeEventListener('ui:insert-template', handler)
        window.removeEventListener('ui:insert-template-link', linkHandler)
      },
    }
  }),
  templateMarkerPlugin,
  templateMarkerGutter,
  templateMarkerTheme,
]
