import { defineStore } from 'pinia'

const STORAGE_KEY = 'ai_travel_planner_store_v1'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to load store from localStorage', e)
    return null
  }
}

function saveToStorage(state) {
  try {
    const toSave = {
      form: state.form,
      plan: state.plan,
      locations: state.locations,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (e) {
    console.warn('Failed to save store to localStorage', e)
  }
}

export const usePlannerStore = defineStore('planner', {
  state: () => ({
    form: {
      destination: '',
      duration: 5,
      budget: 10000,
      travelers: 1,
      preferences: '',
    },
    plan: null,
    locations: [],
  }),
  actions: {
    initFromStorage() {
      const data = loadFromStorage()
      if (data) {
        if (data.form) this.form = Object.assign({}, this.form, data.form)
        if (data.plan) this.plan = data.plan
        if (data.locations) this.locations = data.locations
      }
    },
    setForm(newForm) {
      this.form = Object.assign({}, this.form, newForm)
      saveToStorage(this)
    },
    setPlan(newPlan) {
      this.plan = newPlan
      saveToStorage(this)
    },
    setLocations(newLocations) {
      this.locations = newLocations
      saveToStorage(this)
    },
    clearAll() {
      this.form = {
        destination: '',
        duration: 5,
        budget: 10000,
        travelers: 1,
        preferences: '',
      }
      this.plan = null
      this.locations = []
      try { localStorage.removeItem(STORAGE_KEY) } catch (e) {}
    }
  }
})
