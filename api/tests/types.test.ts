import { success, failure } from '../src/types'

describe('response helpers', () => {
  it('success wraps data with null error', () => {
    const res = success({ id: 1 })
    expect(res.data).toEqual({ id: 1 })
    expect(res.error).toBeNull()
    expect(res.meta).toEqual({})
  })

  it('success includes meta when provided', () => {
    const res = success('ok', { total: 5 })
    expect(res.meta).toEqual({ total: 5 })
  })

  it('failure wraps error string with null data', () => {
    const res = failure('Something broke')
    expect(res.data).toBeNull()
    expect(res.error).toBe('Something broke')
    expect(res.meta).toEqual({})
  })

  it('failure includes meta fields when provided', () => {
    const res = failure('Validation error', { fields: { email: ['Invalid'] } })
    expect(res.meta).toEqual({ fields: { email: ['Invalid'] } })
  })
})
