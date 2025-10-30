<template>
  <div class="planner-container">
    <h2>Plan Your Next Adventure</h2>
    <form @submit.prevent="getPlan">
      <div class="form-group">
        <label for="destination">Destination:</label>
        <div class="input-group">
          <input type="text" id="destination" v-model="form.destination" required>
          <button @click.prevent="startRecognition('destination')">🎤</button>
        </div>
      </div>
      <div class="form-group">
        <label for="duration">Duration (days):</label>
        <div class="input-group">
          <input type="number" id="duration" v-model.number="form.duration" min="1" required>
          <button @click.prevent="startRecognition('duration')">🎤</button>
        </div>
      </div>
      <div class="form-group">
        <label for="budget">Budget:</label>
        <div class="input-group">
          <input type="number" id="budget" v-model.number="form.budget" min="0" required>
          <button @click.prevent="startRecognition('budget')">🎤</button>
        </div>
      </div>
      <div class="form-group">
        <label for="travelers">Number of Travelers:</label>
        <div class="input-group">
          <input type="number" id="travelers" v-model.number="form.travelers" min="1" required>
          <button @click.prevent="startRecognition('travelers')">🎤</button>
        </div>
      </div>
      <div class="form-group">
        <label for="preferences">Preferences (e.g., food, anime):</label>
        <div class="input-group">
          <textarea id="preferences" v-model="form.preferences"></textarea>
          <button @click.prevent="startRecognition('preferences')">🎤</button>
        </div>
      </div>
      <button type="submit">Generate Plan</button>
    </form>

    <div v-if="plan" class="plan-result">
      <h3>Your Travel Plan</h3>
      <button @click="savePlan" class="save-plan-btn">Save Plan</button>
      <div v-for="(day, index) in plan.daily_itinerary" :key="index" class="day-plan">
        <h4>Day {{ index + 1 }}: {{ day.theme }}</h4>
        <ul>
          <li v-for="(activity, i) in day.activities" :key="i" @click="flyToLocation(activity.coords)">
            <strong>{{ activity.time }}:</strong> {{ activity.description }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { useSpeechRecognition } from '@vueuse/core';
import { ref, watch } from 'vue';
import { supabase } from '../supabase';

export default {
  emits: ['locations-updated', 'fly-to'],
  setup(props, { emit }) {
    const form = ref({
      destination: '',
      duration: 5,
      budget: 10000,
      travelers: 1,
      preferences: '',
    });
    const plan = ref(null);
    const targetField = ref(null);

    const { isSupported, isListening, result, start, stop } = useSpeechRecognition();

    watch(result, (newResult) => {
      if (targetField.value) {
        form.value[targetField.value] = newResult;
      }
    });

    const startRecognition = (field) => {
      targetField.value = field;
      start();
    };

    const getPlan = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(form.value),
        });
        const data = await response.json();
        
        // Parse the plan string into a structured object
        const parsedPlan = {
          daily_itinerary: data.plan.split('\n\nDay').map((dayString, index) => {
            if (index === 0) {
              // Handle the first day which doesn't have 'Day' prefix
              const lines = dayString.split('\n');
              const theme = lines[0].replace(/Day \d+: /,'');
              const activities = lines.slice(1).map(line => {
                const [time, ...description] = line.split(':');
                return { time: time.trim(), description: description.join(':').trim() };
              });
              return { theme, activities };
            }
            const lines = dayString.split('\n');
            const theme = lines[0].replace(/\d+: /,'');
            const activities = lines.slice(1).map(line => {
                const [time, ...description] = line.split(':');
                return { time: time.trim(), description: description.join(':').trim() };
            });
            return { theme, activities };
          })
        };
        plan.value = parsedPlan;

        // Extract locations for the map
        const mapLocations = [];
        parsedPlan.daily_itinerary.forEach(day => {
          day.activities.forEach(activity => {
            if (activity.coords) {
              mapLocations.push({ name: activity.description, coords: activity.coords });
            }
          });
        });
        emit('locations-updated', mapLocations);

      } catch (error) {
        console.error('Error generating plan:', error);
      }
    };

    const savePlan = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          alert('Please log in to save your plan.');
          return;
        }

        const { data, error } = await supabase
          .from('plans')
          .insert([
            {
              user_id: session.user.id,
              destination: form.value.destination,
              duration: form.value.duration,
              budget: form.value.budget,
              travelers: form.value.travelers,
              preferences: form.value.preferences,
              plan_details: plan.value,
            },
          ]);
        if (error) throw error;
        alert('Plan saved successfully!');
      } catch (error) {
        console.error('Error saving plan:', error);
        alert('Error saving plan. Make sure you are logged in.');
      }
    };

    const flyToLocation = (coords) => {
      emit('fly-to', coords);
    };

    return {
      form,
      plan,
      isSupported,
      isListening,
      startRecognition,
      stop,
      getPlan,
      savePlan,
      locations,
      flyToLocation,
    };
  },
};
</script>

<style scoped>
.planner-container {
  max-width: 600px;
  margin: 2rem auto;
  padding: 2rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}
.form-group {
  margin-bottom: 1rem;
}
label {
  display: block;
  margin-bottom: 0.5rem;
}
.input-group {
  display: flex;
}
input, textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
button {
  padding: 0.75rem 1.5rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.input-group button {
  margin-left: 0.5rem;
}
.save-plan-btn {
    margin-bottom: 1rem;
    background-color: #28a745;
}
.plan-result {
  margin-top: 2rem;
  text-align: left;
}
.day-plan {
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.day-plan h4 {
  margin-top: 0;
}
.day-plan ul {
  padding-left: 1.5rem;
}
.day-plan ul li {
  cursor: pointer;
}
.day-plan ul li:hover {
  background-color: #eee;
}
</style>