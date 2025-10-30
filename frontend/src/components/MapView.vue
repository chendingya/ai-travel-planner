<template>
  <div style="height: 400px; width: 100%;">
    <l-map ref="map" v-model:zoom="zoom" :center="center">
      <l-tile-layer
        url-template="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        layer-type="base"
        name="OpenStreetMap"
      ></l-tile-layer>
      <l-marker v-for="location in locations" :key="location.name" :lat-lng="location.coords">
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
      map.value.flyTo(coords, 13);
    };

    return { zoom, center, map, flyTo };
  },
};
</script>

<style></style>