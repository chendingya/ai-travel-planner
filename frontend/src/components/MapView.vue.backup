<template>
  <div class="map-container">
    <!-- 国外地图不可用提示 -->
    <div v-if="!isDomestic" class="map-unavailable">
      <t-icon name="location" size="64px" style="color: #ccc; margin-bottom: 16px;" />
      <h3 style="color: #666; margin-bottom: 8px;">地图不可用</h3>
      <p style="color: #999;">该目的地为国外地点，地图功能暂不支持</p>
    </div>
    
    <template v-else>
      <!-- 天数切换按钮 -->
      <div v-if="dayCount > 1 && mapReady" class="day-switcher">
        <t-button
          v-for="day in dayCount"
          :key="day"
          :theme="currentDay === day ? 'primary' : 'default'"
          size="small"
          @click="switchDay(day)"
        >
          第 {{ day }} 天
        </t-button>
      </div>
      
      <div id="amap-container" class="amap-map"></div>
      <div v-if="!mapReady" class="map-loading">
        <t-loading text="地图加载中..." />
      </div>
      <div v-if="locations.length === 0 && mapReady" class="map-empty">
        <t-icon name="location" size="48px" style="color: #ccc; margin-bottom: 12px;" />
        <p style="color: #999;">生成旅行计划后,这里将显示路线地图</p>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount, computed } from "vue";
import { Loading as TLoading, Icon as TIcon, Button as TButton } from 'tdesign-vue-next';

export default {
  components: {
    TLoading,
    TIcon,
    TButton,
  },
  props: {
    locations: {
      type: Array,
      default: () => [],
    },
    destination: {
      type: String,
      default: '',
    },
    dailyItinerary: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    const map = ref(null);
    const mapReady = ref(false);
    const markers = ref([]);
    const drivingRoute = ref(null);
    const geocoder = ref(null);
    const currentDay = ref(1);
    
    // 中国省市列表（用于判断是否国内）
    const chineseCities = [
      '北京', '上海', '天津', '重庆', '广州', '深圳', '成都', '杭州', '西安', '南京',
      '武汉', '苏州', '长沙', '郑州', '沈阳', '青岛', '昆明', '大连', '厦门', '合肥',
      '福州', '哈尔滨', '济南', '温州', '长春', '石家庄', '常州', '泉州', '南宁', '贵阳',
      '南昌', '太原', '无锡', '扬州', '徐州', '珠海', '中山', '佛山', '东莞', '惠州',
      '江门', '汕头', '湛江', '肇庆', '桂林', '三亚', '海口', '兰州', '银川', '西宁',
      '拉萨', '乌鲁木齐', '呼和浩特', '香港', '澳门', '台湾', '台北', '高雄',
      '黑龙江', '吉林', '辽宁', '河北', '山西', '陕西', '甘肃', '青海', '新疆', '西藏',
      '内蒙古', '宁夏', '河南', '山东', '江苏', '安徽', '浙江', '福建', '江西', '湖北',
      '湖南', '广东', '广西', '海南', '四川', '贵州', '云南'
    ];
    
    // 判断是否国内
    const isDomestic = computed(() => {
      if (!props.destination) return true; // 默认国内
      const dest = props.destination.toLowerCase();
      return chineseCities.some(city => props.destination.includes(city));
    });
    
    // 计算总天数
    const dayCount = computed(() => {
      if (props.dailyItinerary && props.dailyItinerary.length > 0) {
        return props.dailyItinerary.length;
      }
      return 1;
    });
    
    // 按天分组的位置数据
    const locationsByDay = computed(() => {
      if (!props.dailyItinerary || props.dailyItinerary.length === 0) {
        return [props.locations];
      }
      
      const grouped = [];
      let globalIndex = 0;
      
      props.dailyItinerary.forEach((day, dayIndex) => {
        const dayLocations = [];
        if (day.activities) {
          day.activities.forEach((activity) => {
            if (activity.description) {
              const location = props.locations.find(loc => 
                loc.name === activity.description || 
                loc.order === globalIndex + 1
              );
              if (location) {
                dayLocations.push({
                  ...location,
                  coords: activity.coords || location.coords
                });
              } else {
                dayLocations.push({
                  name: activity.description,
                  coords: activity.coords,
                  order: globalIndex + 1
                });
              }
              globalIndex++;
            }
          });
        }
        grouped.push(dayLocations);
      });
      
      return grouped.length > 0 ? grouped : [props.locations];
    });
    
    // 当前天的位置
    const currentLocations = computed(() => {
      return locationsByDay.value[currentDay.value - 1] || [];
    });

    // 确保加载高德地理编码服务
    const ensureGeocoder = () => new Promise((resolve) => {
      if (geocoder.value) return resolve(geocoder.value);
      AMap.plugin('AMap.Geocoder', () => {
        geocoder.value = new AMap.Geocoder({ city: '全国' });
        resolve(geocoder.value);
      });
    });

    const geocodeByAMap = async (keyword) => {
      if (!keyword) return null;
      try {
        await ensureGeocoder();
        return await new Promise((resolve) => {
          geocoder.value.getLocation(keyword, (status, result) => {
            if (status === 'complete' && result && result.geocodes && result.geocodes.length > 0) {
              const gc = result.geocodes[0];
              const lng = gc.location.lng;
              const lat = gc.location.lat;
              resolve([lat, lng]);
            } else {
              resolve(null);
            }
          });
        });
      } catch (e) {
        console.warn('AMap geocode failed:', e);
        return null;
      }
    };

    // 初始化高德地图
    const initMap = () => {
      if (!isDomestic.value) {
        console.log('🌍 国外目的地，地图不可用');
        return;
      }
      
      if (typeof AMap === 'undefined') {
        console.error('❌ 高德地图 API 未加载');
        mapReady.value = false;
        return;
      }

      try {
        console.log('🗺️ 正在初始化高德地图...');
        
        const container = document.getElementById('amap-container');
        if (!container) {
          console.error('❌ 地图容器不存在');
          return;
        }
        
        console.log('📏 容器尺寸:', container.offsetWidth, 'x', container.offsetHeight);
        
        map.value = new AMap.Map('amap-container', {
          zoom: 13,
          center: [116.397428, 39.90923],
          mapStyle: 'amap://styles/fresh',
          viewMode: '2D',
          features: ['bg', 'road', 'building', 'point'],
        });

        mapReady.value = true;
        console.log('✅ 高德地图初始化成功');
        
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
      markers.value.forEach(marker => {
        map.value.remove(marker);
      });
      markers.value = [];

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

        const lat = location.coords[0];
        const lng = location.coords[1];
        
        console.log(`📍 添加标记 ${index + 1}: ${location.name} [${lat}, ${lng}]`);

        const marker = new AMap.Marker({
          position: new AMap.LngLat(lng, lat),
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
        map.value.setFitView(markers.value, true, [50, 50, 50, 50]);
      }
    };

    // 绘制路线规划
    const drawRoute = (locations) => {
      if (!map.value || locations.length === 0) {
        console.warn('⚠️ 地图未初始化或无位置数据,无法绘制路线');
        return;
      }

      if (locations.length === 1) {
        console.log('📍 只有一个位置点,仅显示标记');
        addMarkers(locations);
        return;
      }

      addMarkers(locations);

      console.log(`🚗 开始规划路线,共 ${locations.length} 个点`);

      const driving = new AMap.Driving({
        map: map.value,
        policy: AMap.DrivingPolicy.LEAST_TIME,
        hideMarkers: true,
      });

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
    
    // 切换天数
    const switchDay = (day) => {
      currentDay.value = day;
      updateMapForCurrentDay();
    };
    
    // 更新当前天的地图
    const updateMapForCurrentDay = async () => {
      if (!map.value || !isDomestic.value) return;
      
      const locations = currentLocations.value;
      if (locations.length === 0) return;
      
      // 为缺失坐标的地点进行地理编码
      for (const loc of locations) {
        if (!loc.coords || loc.coords.length !== 2) {
          const coords = await geocodeByAMap(loc.name);
          if (coords) {
            loc.coords = coords;
          }
        }
      }
      
      console.log(`📍 第 ${currentDay.value} 天，共 ${locations.length} 个位置点`, locations);
      drawRoute(locations);
    };

    // 监听位置变化
    watch(() => props.locations, async (newLocations) => {
      if (newLocations && newLocations.length > 0 && map.value && isDomestic.value) {
        currentDay.value = 1; // 重置到第一天
        updateMapForCurrentDay();
      }
    }, { deep: true, immediate: true });
    
    // 监听行程数据变化
    watch(() => props.dailyItinerary, () => {
      if (map.value && isDomestic.value) {
        currentDay.value = 1;
        updateMapForCurrentDay();
      }
    }, { deep: true });
    
    // 监听目的地变化
    watch(() => props.destination, (newDest) => {
      if (!newDest) return;
      
      if (!isDomestic.value) {
        console.log('🌍 切换到国外目的地，地图不可用');
        if (map.value) {
          map.value.destroy();
          map.value = null;
          mapReady.value = false;
        }
      } else if (!map.value) {
        console.log('🗺️ 切换到国内目的地，初始化地图');
        initMap();
      }
    });

    // 飞到指定坐标
    const flyTo = (coords) => {
      if (map.value && coords && coords.length === 2) {
        console.log('🛫 飞往坐标:', coords);
        map.value.setCenter(new AMap.LngLat(coords[1], coords[0]));
        map.value.setZoom(15);
      }
    };

    onMounted(() => {
      console.log('🔧 MapView 组件已挂载,准备初始化地图');
      
      if (!isDomestic.value) {
        console.log('🌍 国外目的地，跳过地图初始化');
        return;
      }
      
      if (typeof AMap !== 'undefined') {
        console.log('✅ 高德地图 API 已就绪');
        initMap();
      } else {
        console.log('⏳ 等待高德地图 API 加载...');
        let attempts = 0;
        const maxAttempts = 50;
        
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
      isDomestic,
      dayCount,
      currentDay,
      switchDay,
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
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.05) 0%, rgba(168, 237, 234, 0.08) 100%);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.map-unavailable {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
  padding: 40px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
  width: 80%;
  max-width: 400px;
}

.day-switcher {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: var(--glass-shadow);
}

.amap-map {
  width: 100%;
  height: 100%;
  min-height: 600px;
  z-index: 1;
  border-radius: 20px;
  overflow: hidden;
}

.map-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  padding: 24px 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
}

.map-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
  padding: 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
}

/* 高德地图版权信息样式调整 */
:deep(.amap-logo) {
  opacity: 0.6;
}

:deep(.amap-copyright) {
  opacity: 0.6;
}
</style>

    // 确保加载高德地理编码服务
    const ensureGeocoder = () => new Promise((resolve) => {
      if (geocoder.value) return resolve(geocoder.value);
      AMap.plugin('AMap.Geocoder', () => {
        geocoder.value = new AMap.Geocoder({ city: '全国' });
        resolve(geocoder.value);
      });
    });

    const geocodeByAMap = async (keyword) => {
      if (!keyword) return null;
      try {
        await ensureGeocoder();
        return await new Promise((resolve) => {
          geocoder.value.getLocation(keyword, (status, result) => {
            if (status === 'complete' && result && result.geocodes && result.geocodes.length > 0) {
              const gc = result.geocodes[0];
              const lng = gc.location.lng;
              const lat = gc.location.lat;
              resolve([lat, lng]);
            } else {
              resolve(null);
            }
          });
        });
      } catch (e) {
        console.warn('AMap geocode failed:', e);
        return null;
      }
    };

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

    // 绘制路线规划（需要全部坐标）
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

    // 监听 locations 变化，优先按 order 排序，并为缺失坐标的点进行本地地理编码
    watch(() => props.locations, async (newLocations) => {
      if (newLocations && newLocations.length > 0 && map.value) {
        const ordered = [...newLocations].sort((a, b) => {
          const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY;
          const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY;
          return ao - bo;
        });

        // 依次为缺失坐标的地点进行地理编码
        for (const loc of ordered) {
          if (!loc.coords || loc.coords.length !== 2) {
            const coords = await geocodeByAMap(loc.name);
            if (coords) {
              loc.coords = coords;
            }
          }
        }

        console.log(`📍 更新地图,共 ${ordered.length} 个位置点`, ordered);
        drawRoute(ordered);
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
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.05) 0%, rgba(168, 237, 234, 0.08) 100%);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.amap-map {
  width: 100%;
  height: 100%;
  min-height: 600px;
  z-index: 1;
  border-radius: 20px;
  overflow: hidden;
}

.map-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  padding: 24px 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
}

.map-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
  padding: 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
}

/* 高德地图版权信息样式调整 */
:deep(.amap-logo) {
  opacity: 0.6;
}

:deep(.amap-copyright) {
  opacity: 0.6;
}
</style>