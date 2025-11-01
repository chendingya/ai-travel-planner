<template>
  <div class="map-container">
    <!-- 国外地图不可用提示 -->
    <div v-if="!isDomestic" class="map-unavailable">
      <t-icon name="location" size="64px" style="color: #ccc; margin-bottom: 16px;" />
      <h3 style="color: #666; margin-bottom: 8px;">地图不可用</h3>
      <p style="color: #999;">该目的地为国外地点，地图功能暂不支持</p>
    </div>
    
    <template v-else>
      <!-- 规划状态提示（组件内唯一实例，避免重复弹窗） -->
      <transition name="fade">
        <div v-if="routeStatus === 'planning'" class="route-status route-status--planning">
          <t-icon name="loading" size="16px" class="spin" /> 路线规划中…
        </div>
      </transition>
      <transition name="fade">
        <div v-if="routeStatus === 'success'" class="route-status route-status--success">
          <t-icon name="check-circle" size="16px" /> 路线规划成功
        </div>
      </transition>
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
      <div v-if="currentLocations.length === 0 && mapReady" class="map-empty">
        <t-icon name="location" size="48px" style="color: #ccc; margin-bottom: 12px;" />
        <p style="color: #999;">生成旅行计划后,这里将显示路线地图</p>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount, computed } from "vue";
import { Loading as TLoading, Icon as TIcon, Button as TButton, MessagePlugin } from 'tdesign-vue-next';

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
  setup(props, { emit }) {
    const map = ref(null);
  const mapReady = ref(false);
  const routeLoading = ref(false);
  const routeStatus = ref('idle'); // idle | planning | success
    const markers = ref([]);
    const drivingRoute = ref(null);
    const geocoder = ref(null);
  const placeSearch = ref(null);
  const lastGeocoderCity = ref(null);
  const lastPlaceSearchCity = ref(null);
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
      console.log('🔢 计算 locationsByDay...');
      console.log('📅 dailyItinerary:', props.dailyItinerary?.length || 0, '天');
      console.log('📍 locations:', props.locations.length, '个');
      
      if (!props.dailyItinerary || props.dailyItinerary.length === 0) {
        console.log('⚠️ 没有行程数据，返回全部 locations');
        return [props.locations];
      }
      
      const grouped = [];
      let globalIndex = 0;
      
      props.dailyItinerary.forEach((day, dayIndex) => {
        console.log(`📅 处理第 ${dayIndex + 1} 天:`, day.theme || '无主题', '活动数:', day.activities?.length || 0);
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
        console.log(`  ✅ 第 ${dayIndex + 1} 天提取了 ${dayLocations.length} 个位置`);
        grouped.push(dayLocations);
      });
      
      console.log('📊 总共分组:', grouped.length, '天');
      return grouped.length > 0 ? grouped : [props.locations];
    });
    
    // 当前天的位置
    const currentLocations = computed(() => {
      return locationsByDay.value[currentDay.value - 1] || [];
    });

    // 提取城市名（尽量标准化为 *市/*州/*县/*区），否则退回目的地原文或“全国”
    const extractCity = () => {
      const d = (props.destination || '').trim();
      if (!d) return '全国';
      const m = d.match(/[\u4e00-\u9fa5]{2,10}(市|州|县|区)/);
      if (m) return m[0];
      return d;
    };

    // 规范化地名，去除“ - ”后缀、括号内内容与常见标点
    const normalizePlaceName = (raw) => {
      let name = (raw || '').toString();
      name = name.split(' - ')[0];
      name = name.replace(/（.*?）|\(.*?\)/g, '');
      name = name.replace(/[，。、“”"'·]/g, '');
      name = name.trim();
      return name;
    };

    // 确保加载/更新 Geocoder（按城市复用，城市变更时重建）
    const ensureGeocoder = (cityParam) => new Promise((resolve) => {
      const city = cityParam || extractCity();
      if (geocoder.value && lastGeocoderCity.value === city) return resolve(geocoder.value);
      AMap.plugin('AMap.Geocoder', () => {
        console.log('🔧 初始化地理编码器，城市范围:', city);
        geocoder.value = new AMap.Geocoder({ city });
        lastGeocoderCity.value = city;
        resolve(geocoder.value);
      });
    });

    // 确保加载/更新 PlaceSearch（城市限定）
    const ensurePlaceSearch = (cityParam) => new Promise((resolve) => {
      const city = cityParam || extractCity();
      if (placeSearch.value && lastPlaceSearchCity.value === city) return resolve(placeSearch.value);
      AMap.plugin('AMap.PlaceSearch', () => {
        console.log('🔧 初始化地点搜索，城市范围:', city);
        placeSearch.value = new AMap.PlaceSearch({ city, pageSize: 5 });
        lastPlaceSearchCity.value = city;
        resolve(placeSearch.value);
      });
    });

    // 先用 Geocoder，失败则回退到 PlaceSearch
    const cityMatches = (gc, city) => {
      const cityNorm = city.replace(/[省市州县区]$/,'');
      const f = (s) => (s || '').toString().replace(/[省市州县区]$/,'');
      const fields = [gc.city, gc.province, gc.district];
      if (fields.some(x => f(x).includes(cityNorm) || cityNorm.includes(f(x)))) return true;
      if ((gc.formattedAddress || '').includes(city)) return true;
      return false;
    };

    const geocodeByAMap = async (keyword, depth = 0) => {
      const base = normalizePlaceName(keyword);
      if (!base) return null;
      
      // 防止无限递归
      if (depth > 2) {
        console.warn(`❌ 地理编码递归深度超限: ${keyword}`);
        return null;
      }
      
      const city = extractCity();
      try {
        await ensureGeocoder(city);
        console.log(`🔍[Geocoder] 在 "${city}" 搜索 "${base}" (深度: ${depth})`);
        const geoRes = await new Promise((resolve) => {
          // 添加超时保护
          const timer = setTimeout(() => {
            console.warn(`⏱️ Geocoder 超时: ${base}`);
            resolve(null);
          }, 5000);
          
          geocoder.value.getLocation(base, (status, result) => {
            clearTimeout(timer);
            if (status === 'complete' && result && result.geocodes && result.geocodes.length > 0) {
              const gc = result.geocodes[0];
              if (gc.location) {
                // 校验城市是否匹配，不匹配则触发 PlaceSearch 兜底
                if (!cityMatches(gc, city)) {
                  console.warn(`  ⚠️[Geocoder] 城市不匹配: ${gc.formattedAddress}，期望包含:${city}`);
                  return resolve(null);
                }
                const { lng, lat } = gc.location;
                console.log(`  ✅[Geocoder] ${gc.formattedAddress} -> [${lat}, ${lng}]`);
                return resolve([lat, lng]);
              }
            }
            resolve(null);
          });
        });
        if (geoRes) return geoRes;

        // 回退：PlaceSearch
        await ensurePlaceSearch(city);
        console.log(`🔎[PlaceSearch] 在 "${city}" 搜索 "${base}" (深度: ${depth})`);
        const poiRes = await new Promise((resolve) => {
          // 添加超时保护
          const timer = setTimeout(() => {
            console.warn(`⏱️ PlaceSearch 超时: ${base}`);
            resolve(null);
          }, 5000);
          
          placeSearch.value.search(base, (status, result) => {
            clearTimeout(timer);
            if (status === 'complete' && result && result.poiList && result.poiList.pois && result.poiList.pois.length > 0) {
              // 优先选择与城市/区县匹配的 POI
              const pois = result.poiList.pois;
              const preferred = pois.find(p => (p.cityname && city.includes(p.cityname)) || (p.adname && city.includes(p.adname)) || (p.pname && city.includes(p.pname)) || (p.cityname && city.includes(p.cityname.replace(/[市州县区]$/,'')))) || pois[0];
              if (preferred && preferred.location) {
                const { lng, lat } = preferred.location;
                console.log(`  ✅[PlaceSearch] ${preferred.name} -> [${lat}, ${lng}]`);
                return resolve([lat, lng]);
              }
            }
            resolve(null);
          });
        });
        if (poiRes) return poiRes;

        // 进一步弱化：尝试去除常见尾缀，比如"历史街区/景区/风景区/广场/公园等"
        const softened = base.replace(/(历史街区|风景区|景区|广场|公园|老街|古城|景点|餐厅|饭店|酒店|宾馆)$/g, '');
        if (softened && softened !== base && depth < 2) {
          console.log(`🔁 弱化关键词再次检索: "${softened}" (深度: ${depth + 1})`);
          return await geocodeByAMap(softened, depth + 1);
        }
        
        console.warn(`❌ 所有地理编码方法均失败: ${keyword}`);
        return null;
      } catch (e) {
        console.error(`❌ AMap geocode/search 异常: ${keyword}`, e);
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
    
    // 切换天数
    const switchDay = (day) => {
      currentDay.value = day;
      updateMapForCurrentDay();
    };
    
    // 更新当前天的地图
    const updateMapForCurrentDay = async () => {
      console.log('🔄 开始更新地图 - 第', currentDay.value, '天');
      console.log('🗺️ 地图状态:', map.value ? '已初始化' : '未初始化');
      console.log('🏠 是否国内:', isDomestic.value);
      
      if (!map.value || !isDomestic.value) {
        console.warn('⚠️ 地图未初始化或非国内目的地，跳过更新');
        return;
      }
      
      const locations = currentLocations.value;
      console.log('📍 当前天的位置数量:', locations.length);
      console.log('📍 当前天的位置详情:', locations);
      
      if (locations.length === 0) {
        console.warn('⚠️ 没有位置数据，跳过更新');
        return;
      }
      
      // 防止重复更新：如果正在更新中，直接返回
      if (routeLoading.value) {
        console.log('⚠️ 路线正在规划中，跳过重复请求');
        return;
      }
      
  routeLoading.value = true;
  // 仅在组件内部显示唯一的规划提示，避免全局重复
  routeStatus.value = 'planning';
      const failed = [];
      const geocodedCache = new Set(); // 防止重复地理编码
      
      try {
        // 为缺失坐标的地点进行地理编码
        for (const loc of locations) {
          if (!loc.coords || loc.coords.length !== 2) {
            const placeName = normalizePlaceName(loc.name);
            
            // 跳过已经尝试过但失败的地点
            if (geocodedCache.has(placeName)) {
              console.log(`⏭️ 跳过已处理的地点: ${placeName}`);
              continue;
            }
            
            geocodedCache.add(placeName);
            console.log(`🔍 为 "${placeName}" 进行地理编码...`);
            
            try {
              const coords = await geocodeByAMap(placeName);
              if (coords) {
                console.log(`✅ 地理编码成功: ${placeName} -> [${coords}]`);
                loc.coords = coords;
              } else {
                console.warn(`❌ 地理编码失败: ${placeName}，将从路线中排除`);
                failed.push(placeName);
              }
            } catch (error) {
              console.error(`❌ 地理编码出错: ${placeName}`, error);
              failed.push(placeName);
            }
          }
        }
      
      // 仅使用有坐标的点进行绘制
      const valid = locations.filter(l => l.coords && l.coords.length === 2);
      console.log(`📍 第 ${currentDay.value} 天，可用点 ${valid.length}/${locations.length}`, valid);
      if (valid.length >= 2) {
        drawRoute(valid);
      } else if (valid.length === 1) {
        addMarkers(valid);
        flyTo(valid[0].coords);
      } else {
        console.warn('⚠️ 无有效坐标可绘制，尝试按城市居中');
        const city = extractCity();
        const cityCenter = await geocodeByAMap(city);
        if (cityCenter) flyTo(cityCenter);
      }
        if (failed.length > 0) {
          const sample = failed.slice(0, 3).join('、');
          const more = failed.length > 3 ? ` 等 ${failed.length} 个` : '';
          MessagePlugin.warning({
            content: `以下地点未能定位：${sample}${more}。已从路线中排除。`,
            duration: 5000,
            placement: 'top'
          });
          // 告知父级(用于在页面顶部展示可关闭的告警条)
          emit('route-failed-places', failed);
        }
      } catch (error) {
        console.error('❌ 更新地图出错:', error);
        MessagePlugin.error('地图更新失败，请稍后重试');
      } finally {
        routeLoading.value = false;
        // 路线规划完成提示（若无失败）
        if (failed.length === 0) {
          routeStatus.value = 'success';
          // 1.5s 后自动消失
          setTimeout(() => {
            if (!routeLoading.value) routeStatus.value = 'idle';
          }, 1500);
        } else {
          routeStatus.value = 'idle';
        }
      }
    };

    // 标记防止重复更新
    const updateDebounce = ref(null);
    
    // 监听位置和行程数据变化（合并为一个监听器）
    watch(
      () => [props.locations, props.dailyItinerary],
      ([newLocations, newItinerary]) => {
        console.log('📍 监听到数据变化');
        console.log('  - locations:', newLocations?.length || 0, '个');
        console.log('  - dailyItinerary:', newItinerary?.length || 0, '天');
        
        // 防抖处理：避免短时间内多次触发
        if (updateDebounce.value) {
          clearTimeout(updateDebounce.value);
        }
        
        updateDebounce.value = setTimeout(async () => {
          const hasLocations = newLocations && newLocations.length > 0;
          const hasItinerary = newItinerary && newItinerary.length > 0;
          
          if ((hasLocations || hasItinerary) && map.value && isDomestic.value) {
            currentDay.value = 1; // 重置到第一天
            await updateMapForCurrentDay();
          }
        }, 300); // 300ms 防抖延迟
      },
      { deep: true }
    );
    
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
        // coords 格式: [lat, lng]
        map.value.setCenter(new AMap.LngLat(coords[1], coords[0]));
        map.value.setZoom(15);
      }
    };

    onMounted(() => {
      console.log('🔧 MapView 组件已挂载,准备初始化地图');
      console.log('📍 当前 locations 数量:', props.locations.length);
      console.log('📅 当前行程天数:', props.dailyItinerary?.length || 0);
      console.log('🌍 目的地:', props.destination);
      console.log('🏠 是否国内:', isDomestic.value);
      
      if (!isDomestic.value) {
        console.log('🌍 国外目的地，跳过地图初始化');
        return;
      }
      
      // 等待高德地图 API 加载完成
      if (typeof AMap !== 'undefined') {
        console.log('✅ 高德地图 API 已就绪');
        initMap();
        // 地图初始化后，如果有数据就立即更新
        setTimeout(() => {
          if (props.locations.length > 0 || (props.dailyItinerary && props.dailyItinerary.length > 0)) {
            console.log('🔄 地图初始化完成，开始加载路线');
            updateMapForCurrentDay();
          }
        }, 500);
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
            // 地图初始化后，如果有数据就立即更新
            setTimeout(() => {
              if (props.locations.length > 0 || (props.dailyItinerary && props.dailyItinerary.length > 0)) {
                console.log('🔄 地图初始化完成，开始加载路线');
                updateMapForCurrentDay();
              }
            }, 500);
          } else if (attempts >= maxAttempts) {
            console.error('❌ 高德地图 API 加载超时,请检查网络或 API Key 配置');
            clearInterval(checkAMap);
            mapReady.value = false;
          }
        }, 100);
      }
    });

    onBeforeUnmount(() => {
      if (updateDebounce.value) {
        clearTimeout(updateDebounce.value);
      }
      if (map.value) {
        map.value.destroy();
      }
    });

    return { 
      map, 
      mapReady,
      routeLoading,
      routeStatus,
      flyTo,
      isDomestic,
      dayCount,
      currentDay,
      currentLocations,
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

/* 组件内的路线状态气泡，避免全局重复弹窗 */
.route-status {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 120;
  padding: 8px 12px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.route-status--planning {
  background: rgba(0, 132, 255, 0.15);
  color: #0066cc;
  border: 1px solid rgba(0, 132, 255, 0.25);
}

.route-status--success {
  background: rgba(82, 196, 26, 0.15);
  color: #1f8b24;
  border: 1px solid rgba(82, 196, 26, 0.25);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 高德地图版权信息样式调整 */
:deep(.amap-logo) {
  opacity: 0.6;
}

:deep(.amap-copyright) {
  opacity: 0.6;
}
</style>