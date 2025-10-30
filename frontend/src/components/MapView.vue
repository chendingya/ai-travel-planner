<template>
  <div class="map-container">
    <l-map ref="map" v-model:zoom="zoom" :center="center" class="leaflet-map">
      <l-tile-layer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        layer-type="base"
        name="OpenStreetMap"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      ></l-tile-layer>
      <l-marker v-for="(location, index) in locations" :key="index" :lat-lng="location.coords">
        <l-popup>{{ location.name }}</l-popup>
      </l-marker>
    </l-map>
  </div>
</template>

<script>
import { ref, watch } from "vue";
import "leaflet/dist/leaflet.css";
import {
  LMap,
  LTileLayer,
  LMarker,
  LPopup,
} from "@vue-leaflet/vue-leaflet";

export default {
  components: {
    LMap,
    LTileLayer,
    LMarker,
    LPopup,
  },
  props: {
    locations: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    const zoom = ref(2);
    const center = ref([47.41322, -1.219482]);
    const map = ref(null);

    watch(() => props.locations, (newLocations) => {
      if (newLocations.length > 0) {
        center.value = newLocations[0].coords;
        zoom.value = 13;
      }
    });

    const flyTo = (coords) => {
      if (map.value && map.value.leafletObject) {
        map.value.leafletObject.flyTo(coords, 13);
      }
    };

    return { zoom, center, map, flyTo };
  },
};
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: var(--border-radius);
}

.leaflet-map {
  width: 100%;
  height: 100%;
  z-index: 1;
}
</style>