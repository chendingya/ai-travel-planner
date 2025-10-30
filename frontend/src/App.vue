<template>
  <div id="app">
    <nav>
      <a @click="view = 'planner'" :class="{ active: view === 'planner' }">Planner</a>
      <a @click="view = 'saved'" :class="{ active: view === 'saved' }">Saved Plans</a>
      <a @click="view = 'settings'" :class="{ active: view === 'settings' }">Settings</a>
    </nav>
    <Auth />
    <div v-if="view === 'planner'" class="main-content">
      <Planner @locations-updated="updateLocations" @fly-to="flyTo" />
      <MapView :locations="locations" ref="mapView" />
    </div>
    <SavedPlans v-if="view === 'saved'" />
    <Settings v-if="view === 'settings'" />
  </div>
</template>

<script>
import { ref } from 'vue';
import Auth from './components/Auth.vue';
import Planner from './components/Planner.vue';
import MapView from './components/MapView.vue';
import SavedPlans from './components/SavedPlans.vue';
import Settings from './components/Settings.vue';

export default {
  name: 'App',
  components: {
    Auth,
    Planner,
    MapView,
    SavedPlans,
    Settings
  },
  setup() {
    const view = ref('planner');
    const locations = ref([]);
    const mapView = ref(null);

    const updateLocations = (newLocations) => {
      locations.value = newLocations;
    };

    const flyTo = (coords) => {
      mapView.value.flyTo(coords);
    };

    return {
      view,
      locations,
      updateLocations,
      flyTo,
      mapView,
    };
  },
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,.1);
  padding: 1rem;
  z-index: 100;
}

nav a {
  display: inline-block;
  padding: 0.5rem 1rem;
  margin: 0 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.3s;
}

nav a:hover {
  background-color: #f0f0f0;
}

nav a.active {
  background-color: #007bff;
  color: white;
}

.main-content {
  display: flex;
  height: calc(100vh - 100px);
  margin-top: 20px;
}

@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
  }
}
</style>