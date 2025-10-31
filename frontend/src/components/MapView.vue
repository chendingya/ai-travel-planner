<template>
  <div class="map-container">
    <div id="amap-container" class="amap-map"></div>
    <div v-if="!mapReady" class="map-loading">
      <t-loading text="地图加载中..." />
    </div>
    <div v-if="locations.length === 0 && mapReady" class="map-empty">
      <t-icon name="location" size="48px" style="color: #ccc; margin-bottom: 12px;" />
      <p style="color: #999;">生成旅行计划后,这里将显示路线地图</p>
    </div>
  </div>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { Loading as TLoading, Icon as TIcon } from 'tdesign-vue-next';

export default {
  components: {
    TLoading,
    TIcon,
  },
  props: {
    locations: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    const map = ref(null);
    const mapReady = ref(false);
    const markers = ref([]);
    const drivingRoute = ref(null);

    // 初始化高德地图
    const initMap = () => {
      if (typeof AMap === 'undefined') {
        console.error('高德地图 API 未加载');
        return;
      }

      // 创建地图实例
      map.value = new AMap.Map('amap-container', {
        zoom: 13,
        center: [116.397428, 39.90923], // 默认北京天安门
        mapStyle: 'amap://styles/fresh', // 清新风格
        viewMode: '2D',
        features: ['bg', 'road', 'building', 'point'],
      });

      mapReady.value = true;
      console.log('✅ 高德地图初始化成功');
    };

    // 清除所有标记和路线
    const clearMap = () => {
      // 清除标记
      markers.value.forEach(marker => {
        map.value.remove(marker);
      });
      markers.value = [];

      // 清除路线
      if (drivingRoute.value) {
        map.value.remove(drivingRoute.value);
        drivingRoute.value = null;
      }
    };

    // 添加标记点
    const addMarkers = (locations) => {
      if (!map.value || locations.length === 0) return;

      clearMap();

      locations.forEach((location, index) => {
        const marker = new AMap.Marker({
          position: new AMap.LngLat(location.coords[1], location.coords[0]), // [lng, lat]
          title: location.name,
          label: {
            content: `<div style="background: #0084ff; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${index + 1}</div>`,
            offset: new AMap.Pixel(0, -35),
          },
          extData: {
            index: index,
            name: location.name,
          },
        });

        // 添加点击事件
        marker.on('click', () => {
          const infoWindow = new AMap.InfoWindow({
            content: `<div style="padding: 8px;">
              <h4 style="margin: 0 0 8px 0; color: #0084ff;">站点 ${index + 1}</h4>
              <p style="margin: 0; font-size: 14px;">${location.name}</p>
            </div>`,
            offset: new AMap.Pixel(0, -30),
          });
          infoWindow.open(map.value, marker.getPosition());
        });

        markers.value.push(marker);
        map.value.add(marker);
      });

      // 自动调整视野以包含所有点
      map.value.setFitView(markers.value, true, [50, 50, 50, 50]);
    };

    // 绘制路线规划
    const drawRoute = (locations) => {
      if (!map.value || locations.length < 2) {
        // 如果只有一个点,只添加标记
        if (locations.length === 1) {
          addMarkers(locations);
        }
        return;
      }

      // 先添加标记
      addMarkers(locations);

      // 创建驾车路线规划
      const driving = new AMap.Driving({
        map: map.value,
        policy: AMap.DrivingPolicy.LEAST_TIME, // 最快路线
        hideMarkers: true, // 隐藏默认标记(我们已经添加了自定义标记)
      });

      // 构建途经点数组
      const waypoints = [];
      if (locations.length > 2) {
        for (let i = 1; i < locations.length - 1; i++) {
          waypoints.push(new AMap.LngLat(locations[i].coords[1], locations[i].coords[0]));
        }
      }

      // 起点和终点
      const start = new AMap.LngLat(locations[0].coords[1], locations[0].coords[0]);
      const end = new AMap.LngLat(locations[locations.length - 1].coords[1], locations[locations.length - 1].coords[0]);

      // 搜索路线
      if (waypoints.length > 0) {
        driving.search(start, end, { waypoints }, (status, result) => {
          if (status === 'complete') {
            console.log('✅ 路线规划成功');
          } else {
            console.warn('⚠️ 路线规划失败,仅显示标记点');
          }
        });
      } else {
        driving.search(start, end, (status, result) => {
          if (status === 'complete') {
            console.log('✅ 路线规划成功');
          } else {
            console.warn('⚠️ 路线规划失败,仅显示标记点');
          }
        });
      }

      drivingRoute.value = driving;
    };

    // 监听 locations 变化
    watch(() => props.locations, (newLocations) => {
      if (newLocations && newLocations.length > 0 && map.value) {
        console.log(`📍 更新地图,共 ${newLocations.length} 个位置点`);
        drawRoute(newLocations);
      }
    }, { deep: true });

    // 飞到指定坐标
    const flyTo = (coords) => {
      if (map.value) {
        map.value.setCenter(new AMap.LngLat(coords[1], coords[0]));
        map.value.setZoom(15);
      }
    };

    onMounted(() => {
      // 等待高德地图 API 加载完成
      if (typeof AMap !== 'undefined') {
        initMap();
      } else {
        const checkAMap = setInterval(() => {
          if (typeof AMap !== 'undefined') {
            clearInterval(checkAMap);
            initMap();
          }
        }, 100);
      }
    });

    onBeforeUnmount(() => {
      if (map.value) {
        map.value.destroy();
      }
    });

    return { 
      map, 
      mapReady,
      flyTo,
    };
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
  background: #f5f5f5;
}

.amap-map {
  width: 100%;
  height: 100%;
  z-index: 1;
}

.map-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}

.map-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
}

/* 高德地图版权信息样式调整 */
:deep(.amap-logo) {
  opacity: 0.6;
}

:deep(.amap-copyright) {
  opacity: 0.6;
}
</style>