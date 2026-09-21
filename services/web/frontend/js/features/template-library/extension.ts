import {
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state'
import {
  EditorView,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  gutter,
} from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
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

type FulfilledTemplatePositions = Set<number>

const fulfillTemplate = StateEffect.define<number>()
const unfulfillTemplate = StateEffect.define<number>()

const templateMarkerState = StateField.define<FulfilledTemplatePositions>({
  create() {
    return new Set()
  },
  update(value, transaction) {
    let nextValue = value

    if (transaction.docChanged) {
      nextValue = new Set(
        Array.from(value, position =>
          transaction.changes.mapPos(position)
        )
      )
    }

    for (const effect of transaction.effects) {
      if (effect.is(fulfillTemplate)) {
        nextValue = nextValue === value ? new Set(value) : nextValue
        nextValue.add(effect.value)
      } else if (effect.is(unfulfillTemplate)) {
        nextValue = nextValue === value ? new Set(value) : nextValue
        nextValue.delete(effect.value)
      }
    }

    return nextValue
  },
})

const templateMarkerHistory = invertedEffects.of(transaction => {
  const effects: StateEffect<number>[] = []

  for (const effect of transaction.effects) {
    if (effect.is(fulfillTemplate)) {
      effects.push(unfulfillTemplate.of(effect.value))
    } else if (effect.is(unfulfillTemplate)) {
      effects.push(fulfillTemplate.of(effect.value))
    }
  }

  return effects
})

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

    return {
      lineFrom,
      template,
    }
  }

  private createMarkers() {
    const fulfilledPositions = this.view.state.field(templateMarkerState)
    const builder = new RangeSetBuilder<TemplateMarker>()

    for (
      let lineNumber = 1;
      lineNumber <= this.view.state.doc.lines;
      lineNumber++
    ) {
      const line = this.view.state.doc.line(lineNumber)
      const template = findTemplateMatch(this.templates, line.text)
      if (!template) continue

      builder.add(
        line.from,
        line.from,
        new TemplateMarker(
          template,
          fulfilledPositions.has(line.from)
        )
      )
    }

    return builder.finish()
  }

  private insert(match: TemplateMatch) {
    const line = this.view.state.doc.lineAt(match.lineFrom)
    const fulfilledPositions = this.view.state.field(templateMarkerState)

    if (fulfilledPositions.has(line.from)) return

    const content = match.template.content.replace(/\s+$/, '')
    if (!content) return

    this.view.dispatch({
      changes: {
        from: line.to,
        to: line.to,
        insert: '\n' + content + '\n',
      },
      effects: fulfillTemplate.of(line.from),
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
  templateMarkerState,
  templateMarkerHistory,
  templateMarkerPlugin,
  templateMarkerGutter,
  templateMarkerTheme,
]
