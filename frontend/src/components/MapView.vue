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
        console.error('❌ 高德地图 API 未加载');
        mapReady.value = false;
        return;
      }

      try {
        console.log('🗺️ 正在初始化高德地图...');
        
        // 确保容器存在且有高度
        const container = document.getElementById('amap-container');
        if (!container) {
          console.error('❌ 地图容器不存在');
          return;
        }
        
        console.log('📏 容器尺寸:', container.offsetWidth, 'x', container.offsetHeight);
        
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
        
        // 添加地图加载完成事件
        map.value.on('complete', () => {
          console.log('✅ 高德地图渲染完成');
        });
      } catch (error) {
        console.error('❌ 高德地图初始化失败:', error);
        mapReady.value = false;
      }
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
      if (!map.value || locations.length === 0) {
        console.warn('⚠️ 地图未初始化或无位置数据');
        return;
      }

      clearMap();
      console.log('🗺️ 开始添加标记点:', locations);

      locations.forEach((location, index) => {
        if (!location.coords || location.coords.length !== 2) {
          console.warn(`⚠️ 位置 ${location.name} 缺少有效坐标`);
          return;
        }

        // coords 格式: [lat, lng]
        const lat = location.coords[0];
        const lng = location.coords[1];
        
        console.log(`📍 添加标记 ${index + 1}: ${location.name} [${lat}, ${lng}]`);

        const marker = new AMap.Marker({
          position: new AMap.LngLat(lng, lat), // 高德需要 [lng, lat]
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

      if (markers.value.length > 0) {
        console.log(`✅ 成功添加 ${markers.value.length} 个标记点`);
        // 自动调整视野以包含所有点
        map.value.setFitView(markers.value, true, [50, 50, 50, 50]);
      }
    };

    // 绘制路线规划
    const drawRoute = (locations) => {
      if (!map.value || locations.length === 0) {
        console.warn('⚠️ 地图未初始化或无位置数据,无法绘制路线');
        return;
      }

      // 如果只有一个点,只添加标记
      if (locations.length === 1) {
        console.log('📍 只有一个位置点,仅显示标记');
        addMarkers(locations);
        return;
      }

      // 先添加标记
      addMarkers(locations);

      console.log(`🚗 开始规划路线,共 ${locations.length} 个点`);

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
          const loc = locations[i];
          if (loc.coords && loc.coords.length === 2) {
            waypoints.push(new AMap.LngLat(loc.coords[1], loc.coords[0]));
          }
        }
        console.log(`🛣️ 途经点数量: ${waypoints.length}`);
      }

      // 起点和终点
      const startLoc = locations[0];
      const endLoc = locations[locations.length - 1];
      
      if (!startLoc.coords || !endLoc.coords) {
        console.error('❌ 起点或终点缺少坐标');
        return;
      }

      const start = new AMap.LngLat(startLoc.coords[1], startLoc.coords[0]);
      const end = new AMap.LngLat(endLoc.coords[1], endLoc.coords[0]);

      console.log(`🚩 起点: ${startLoc.name} [${startLoc.coords}]`);
      console.log(`🏁 终点: ${endLoc.name} [${endLoc.coords}]`);

      // 搜索路线
      if (waypoints.length > 0) {
        driving.search(start, end, { waypoints }, (status, result) => {
          if (status === 'complete') {
            console.log('✅ 路线规划成功', result);
          } else {
            console.warn('⚠️ 路线规划失败,仅显示标记点', status, result);
          }
        });
      } else {
        driving.search(start, end, (status, result) => {
          if (status === 'complete') {
            console.log('✅ 路线规划成功', result);
          } else {
            console.warn('⚠️ 路线规划失败,仅显示标记点', status, result);
          }
        });
      }

      drivingRoute.value = driving;
    };

    // 监听 locations 变化
    watch(() => props.locations, (newLocations) => {
      if (newLocations && newLocations.length > 0 && map.value) {
        console.log(`📍 更新地图,共 ${newLocations.length} 个位置点`, newLocations);
        drawRoute(newLocations);
      }
    }, { deep: true, immediate: true });

    // 飞到指定坐标
    const flyTo = (coords) => {
      if (map.value && coords && coords.length === 2) {
        console.log('🛫 飞往坐标:', coords);
        // coords 格式: [lat, lng]
        map.value.setCenter(new AMap.LngLat(coords[1], coords[0]));
        map.value.setZoom(15);
      }
    };

    onMounted(() => {
      console.log('🔧 MapView 组件已挂载,准备初始化地图');
      
      // 等待高德地图 API 加载完成
      if (typeof AMap !== 'undefined') {
        console.log('✅ 高德地图 API 已就绪');
        initMap();
      } else {
        console.log('⏳ 等待高德地图 API 加载...');
        let attempts = 0;
        const maxAttempts = 50; // 最多等待 5 秒
        
        const checkAMap = setInterval(() => {
          attempts++;
          if (typeof AMap !== 'undefined') {
            console.log('✅ 高德地图 API 加载完成');
            clearInterval(checkAMap);
            initMap();
          } else if (attempts >= maxAttempts) {
            console.error('❌ 高德地图 API 加载超时,请检查网络或 API Key 配置');
            clearInterval(checkAMap);
            mapReady.value = false;
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
  min-height: 600px;
  position: relative;
  overflow: hidden;
  border-radius: var(--border-radius);
  background: #f5f5f5;
}

.amap-map {
  width: 100%;
  height: 100%;
  min-height: 600px;
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