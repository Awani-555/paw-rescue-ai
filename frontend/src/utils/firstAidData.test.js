import { describe, expect, it } from 'vitest'
import { firstAidData, filterFirstAid } from './firstAidData'

const VALID_SEVERITIES = ['critical', 'urgent', 'mild']
const REQUIRED_FIELDS = ['id', 'species', 'situation', 'severity', 'immediateSteps', 'doNot', 'callImmediately']

describe('firstAidData', () => {
  it('has at least one entry', () => {
    expect(firstAidData.length).toBeGreaterThan(0)
  })

  it('every entry has all required fields', () => {
    for (const entry of firstAidData) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry).toHaveProperty(field)
      }
      expect(Array.isArray(entry.immediateSteps)).toBe(true)
      expect(entry.immediateSteps.length).toBeGreaterThan(0)
      expect(Array.isArray(entry.doNot)).toBe(true)
    }
  })

  it('every entry has a valid severity value', () => {
    for (const entry of firstAidData) {
      expect(VALID_SEVERITIES).toContain(entry.severity)
    }
  })

  it('every entry has unique id', () => {
    const ids = firstAidData.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('filterFirstAid', () => {
  it('returns all entries when species is "All" and query is empty', () => {
    const results = filterFirstAid(firstAidData, { species: 'All', query: '' })
    expect(results.length).toBe(firstAidData.length)
  })

  it('filters correctly by species', () => {
    const results = filterFirstAid(firstAidData, { species: 'Dog', query: '' })
    expect(results.length).toBeGreaterThan(0)
    for (const entry of results) {
      expect(entry.species).toBe('Dog')
    }
  })

  it('filters by search query text', () => {
    const results = filterFirstAid(firstAidData, { species: 'All', query: 'choking' })
    expect(results.length).toBeGreaterThan(0)
    for (const entry of results) {
      expect(entry.situation.toLowerCase()).toContain('choking')
    }
  })

  it('returns empty array when nothing matches', () => {
    const results = filterFirstAid(firstAidData, { species: 'All', query: 'zzz-no-match-zzz' })
    expect(results).toEqual([])
  })
})
