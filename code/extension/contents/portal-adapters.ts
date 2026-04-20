import type { PortalContext } from "~lib/messages"

export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement

export type PortalAdapter = {
  portal: PortalContext
  resolveActiveEditableElement: (doc: Document) => EditableTarget | null
}

type AdapterDefinition = {
  matchesHost: (hostname: string) => boolean
  adapter: PortalAdapter
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio", "file"])

const ADAPTERS: AdapterDefinition[] = [
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "linkedin.com"),
    adapter: {
      portal: {
        id: "linkedin",
        name: "LinkedIn",
        confidence: 0.85,
        strategy: "shadow-dom"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(resolveDeepActiveElement(doc))
    }
  },
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "greenhouse.io"),
    adapter: {
      portal: {
        id: "greenhouse",
        name: "Greenhouse",
        confidence: 0.92,
        strategy: "generic"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(doc.activeElement)
    }
  },
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "lever.co"),
    adapter: {
      portal: {
        id: "lever",
        name: "Lever",
        confidence: 0.92,
        strategy: "generic"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(doc.activeElement)
    }
  },
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "workday.com"),
    adapter: {
      portal: {
        id: "workday",
        name: "Workday",
        confidence: 0.5,
        strategy: "iframe-limited"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(resolveDeepActiveElement(doc))
    }
  },
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "ashbyhq.com"),
    adapter: {
      portal: {
        id: "ashbyhq",
        name: "Ashby",
        confidence: 0.75,
        strategy: "generic"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(resolveDeepActiveElement(doc))
    }
  },
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "smartrecruiters.com"),
    adapter: {
      portal: {
        id: "smartrecruiters",
        name: "SmartRecruiters",
        confidence: 0.8,
        strategy: "generic"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(resolveDeepActiveElement(doc))
    }
  },
  {
    matchesHost: (hostname) => hostEndsWith(hostname, "workatastartup.com"),
    adapter: {
      portal: {
        id: "workatastartup",
        name: "Work at a Startup",
        confidence: 0.88,
        strategy: "generic"
      },
      resolveActiveEditableElement: (doc) => toEditableTarget(resolveDeepActiveElement(doc))
    }
  }
]

const GENERIC_ADAPTER: PortalAdapter = {
  portal: {
    id: "generic",
    name: "Generic ATS",
    confidence: 0.6,
    strategy: "generic"
  },
  resolveActiveEditableElement: (doc) => toEditableTarget(doc.activeElement)
}

export function getPortalAdapterForHost(hostname: string): PortalAdapter {
  const normalized = hostname.toLowerCase()
  const found = ADAPTERS.find((entry) => entry.matchesHost(normalized))
  return found?.adapter ?? GENERIC_ADAPTER
}

export function resolveEditableFromEventTarget(target: EventTarget | null): EditableTarget | null {
  if (!(target instanceof Element)) {
    return null
  }

  const direct = toEditableTarget(target)
  if (direct) {
    return direct
  }

  if (target instanceof HTMLElement) {
    const closestEditable = target.closest("input, textarea, [contenteditable]")
    return toEditableTarget(closestEditable)
  }

  return null
}

function resolveDeepActiveElement(root: Document | ShadowRoot): Element | null {
  let current: Element | null = root.activeElement

  while (current instanceof HTMLElement && current.shadowRoot?.activeElement instanceof Element) {
    current = current.shadowRoot.activeElement
  }

  return current
}

function toEditableTarget(element: Element | null): EditableTarget | null {
  if (!element) {
    return null
  }

  if (element instanceof HTMLInputElement) {
    if (element.type && NON_TEXT_INPUT_TYPES.has(element.type)) {
      return null
    }

    return element
  }

  if (element instanceof HTMLTextAreaElement) {
    return element
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return element
  }

  return null
}

function hostEndsWith(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}
