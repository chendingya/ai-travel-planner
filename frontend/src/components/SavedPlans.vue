<template>
  <div class="saved-plans-container">
    <h3>Saved Plans</h3>
    <ul>
      <li v-for="plan in plans" :key="plan.id">
        <div @click="selectedPlanId = plan.id">
          <span>{{ plan.destination }}</span>
          <button @click.stop="deletePlan(plan.id)">Delete</button>
        </div>
        <ExpenseTracker v-if="selectedPlanId === plan.id" :plan-id="plan.id" />
      </li>
    </ul>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import ExpenseTracker from './ExpenseTracker.vue';

export default {
  components: {
    ExpenseTracker,
  },
  setup() {
    const plans = ref([]);
    const selectedPlanId = ref(null);

    const fetchPlans = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .eq('user_id', session.user.id);
        if (error) throw error;
        plans.value = data;
      } catch (error) {
        console.error('Error fetching plans:', error);
      }
    };

    const deletePlan = async (id) => {
      try {
        const { error } = await supabase.from('plans').delete().eq('id', id);
        if (error) throw error;
        plans.value = plans.value.filter((plan) => plan.id !== id);
      } catch (error) {
        console.error('Error deleting plan:', error);
      }
    };

    onMounted(fetchPlans);

    return {
      plans,
      deletePlan,
      selectedPlanId,
    };
  },
};
</script>

<style scoped>
/* Add your styles here */
.saved-plans-container ul {
  list-style: none;
  padding: 0;
}
.saved-plans-container li > div {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
}
</style>