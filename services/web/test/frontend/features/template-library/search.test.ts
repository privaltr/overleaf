import { describe, expect, it } from 'vitest'
import { relevanceScore } from '@/features/template-library/util/search'

describe('template relevance search', () => {
  it('weights title matches above description and content matches', () => {
    const titleMatch = relevanceScore(
      {
        title: 'Network Assessment',
        description: 'Generic report section',
        content: 'Generic content',
      },
      'network'
    )
    const contentMatch = relevanceScore(
      {
        title: 'Generic',
        description: 'Generic',
        content: 'network assessment',
      },
      'network'
    )

    expect(titleMatch).toBeGreaterThan(contentMatch)
  })

  it('returns no score for unrelated content', () => {
    expect(
      relevanceScore(
        {
          title: 'Application',
          description: 'Web testing',
          content: '\\section{Authentication}',
        },
        'banana'
      )
    ).toBe(0)
  })

  it('handles approximate terms', () => {
    expect(
      relevanceScore(
        {
          title: 'Authentication Assessment',
          description: '',
          content: '',
        },
        'authentcation'
      )
    ).toBeGreaterThan(0)
  })
})
