/** Brand tokens for synthesized Home treatments. Structure is shared. */

export type ShowcaseTheme = {
  id: '1' | '2' | '3'
  title: string
  thesis: string
  vars: Record<string, string>
  colors: Record<string, string>
}

export const TREATMENTS: ShowcaseTheme[] = [
  {
    id: '1',
    title: 'Treatment 1 — Dark / Orange',
    thesis: 'Near-black utility surface with a crisp burnt-orange accent. Less brown/tan than production.',
    colors: {
      background: '#0E0E0E',
      text: '#F2F2F0',
      muted: '#8B8B86',
      divider: '#2C2C2C',
      accent: '#D45A1A',
      status: '#D45A1A',
      support: '#8B8B86',
    },
    vars: {
      '--sx-bg': '#0E0E0E',
      '--sx-text': '#F2F2F0',
      '--sx-muted': '#8B8B86',
      '--sx-divider': '#2C2C2C',
      '--sx-accent': '#D45A1A',
      '--sx-status': '#D45A1A',
      '--sx-dot-empty': '#D45A1A',
      '--sx-dot-fill': '#D45A1A',
      '--sx-support': '#8B8B86',
    },
  },
  {
    id: '2',
    title: 'Treatment 2 — Light / Orange',
    thesis: 'Practical light payment utility. Cool off-white, near-black type, restrained orange. No beige lifestyle look.',
    colors: {
      background: '#F6F6F4',
      text: '#141414',
      muted: '#6A6A6A',
      divider: '#E2E2DE',
      accent: '#C94E12',
      status: '#C94E12',
      support: '#6A6A6A',
    },
    vars: {
      '--sx-bg': '#F6F6F4',
      '--sx-text': '#141414',
      '--sx-muted': '#6A6A6A',
      '--sx-divider': '#E2E2DE',
      '--sx-accent': '#C94E12',
      '--sx-status': '#C94E12',
      '--sx-dot-empty': '#C94E12',
      '--sx-dot-fill': '#C94E12',
      '--sx-support': '#6A6A6A',
    },
  },
  {
    id: '3',
    title: 'Treatment 3 — Nimiq-adjacent',
    thesis: 'Light neutral utility with blue as a quiet network/support color. CrowdDrop orange stays the product accent.',
    colors: {
      background: '#F8FAFC',
      text: '#121417',
      muted: '#5B6570',
      divider: '#E4E8ED',
      accent: '#E05A1A',
      status: '#E05A1A',
      support: '#2F6BFF',
    },
    vars: {
      '--sx-bg': '#F8FAFC',
      '--sx-text': '#121417',
      '--sx-muted': '#5B6570',
      '--sx-divider': '#E4E8ED',
      '--sx-accent': '#E05A1A',
      '--sx-status': '#E05A1A',
      '--sx-dot-empty': '#E05A1A',
      '--sx-dot-fill': '#E05A1A',
      '--sx-support': '#2F6BFF',
    },
  },
]
