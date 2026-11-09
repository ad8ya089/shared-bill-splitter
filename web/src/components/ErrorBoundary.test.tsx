import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  it('shows a fallback and reload button when a child throws', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>,
      )
      expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeInstanceOf(HTMLButtonElement)
    } finally {
      log.mockRestore()
    }
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>Home content</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Home content')).toBeInstanceOf(HTMLElement)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
