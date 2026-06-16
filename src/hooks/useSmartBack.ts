import { useNavigate, useLocation } from 'react-router-dom'

/**
 * Returns a back handler that uses browser history when available,
 * or navigates to a fixed fallback route on direct URL entry (bookmark, shared link).
 */
export function useSmartBack(fallbackPath: string) {
  const navigate = useNavigate()
  const location = useLocation()

  return () => {
    if (location.key === 'default') {
      navigate(fallbackPath)
    } else {
      navigate(-1)
    }
  }
}
