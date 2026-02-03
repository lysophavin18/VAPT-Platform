import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../api/client'

interface User {
  id: string
  email: string
  username: string
  full_name: string | null
  role: string
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)

        const response = await api.post('/api/auth/login', formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })

        const { access_token, refresh_token } = response.data
        
        // Get user info
        const userResponse = await api.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${access_token}` }
        })

        set({
          token: access_token,
          refreshToken: refresh_token,
          user: userResponse.data,
          isAuthenticated: true
        })
      },

      logout: () => {
        set({
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false
        })
      },

      setUser: (user: User) => set({ user })
    }),
    {
      name: 'vapt-auth-storage'
    }
  )
)

export default useAuthStore
