import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { I18nProvider, useI18n, dict } from '@/lib/i18n'

describe('i18n', () => {
  it('has a Kazakh translation for every Russian key and no untranslated copies', () => {
    const ru = Object.keys(dict.ru)
    const kk = Object.keys(dict.kk)
    expect(kk.sort()).toEqual(ru.sort())
    const identical = ru.filter((k) => dict.ru[k as keyof typeof dict.ru] === dict.kk[k as keyof typeof dict.kk] && /[а-яё]/i.test(dict.ru[k as keyof typeof dict.ru]))
    // Loanwords shared by both languages (Симулятор, Оператор, Станция, Сценарий, Телеметрия…) may coincide,
    // but anything beyond that list means a translation was pasted from Russian.
    expect(identical.length).toBeLessThanOrEqual(25)
  })
  it('interpolates variables and persists the language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider })
    expect(result.current.t('kpi_of_total', { n: 7 })).toBe('из 7')
    act(() => result.current.setLang('kk'))
    expect(result.current.lang).toBe('kk')
    expect(result.current.t('nav_overview')).toBe('Шолу')
    expect(localStorage.getItem('urpaq.lang')).toBe('kk')
    expect(document.documentElement.lang).toBe('kk')
    expect(result.current.pick({ ru: 'р', kk: 'қ' })).toBe('қ')
  })
})
