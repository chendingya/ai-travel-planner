<template>
  <div class="expense-tracker-container">
    <h3>Expense Tracker</h3>
    <form @submit.prevent="addExpense">
      <div class="form-group">
        <label for="description">Description:</label>
        <input type="text" id="description" v-model="form.description" required>
      </div>
      <div class="form-group">
        <label for="amount">Amount:</label>
        <input type="number" id="amount" v-model.number="form.amount" min="0" required>
      </div>
      <button type="submit">Add Expense</button>
    </form>
    <ul class="expense-list">
      <li v-for="expense in expenses" :key="expense.id">
        <span>{{ expense.description }}: ${{ expense.amount }}</span>
        <button @click="deleteExpense(expense.id)">Delete</button>
      </li>
    </ul>
    <div class="total-expenses">
      <strong>Total: ${{ totalExpenses }}</strong>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../supabase';

export default {
  props: {
    planId: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const form = ref({
      description: '',
      amount: null,
    });
    const expenses = ref([]);

    const fetchExpenses = async () => {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .eq('plan_id', props.planId);
        if (error) throw error;
        expenses.value = data;
      } catch (error) {
        console.error('Error fetching expenses:', error);
      }
    };

    const addExpense = async () => {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .insert([
            {
              plan_id: props.planId,
              description: form.value.description,
              amount: form.value.amount,
            },
          ])
          .select();
        if (error) throw error;
        expenses.value.push(data[0]);
        form.value.description = '';
        form.value.amount = null;
      } catch (error) {
        console.error('Error adding expense:', error);
      }
    };

    const deleteExpense = async (id) => {
      try {
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) throw error;
        expenses.value = expenses.value.filter((expense) => expense.id !== id);
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    };

    const totalExpenses = computed(() => {
      return expenses.value.reduce((total, expense) => total + expense.amount, 0);
    });

    onMounted(fetchExpenses);

    return {
      form,
      expenses,
      addExpense,
      deleteExpense,
      totalExpenses,
    };
  },
};
</script>

<style scoped>
.expense-tracker-container {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  margin-top: 1rem;
}
.expense-list {
  list-style: none;
  padding: 0;
}
.expense-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}
.total-expenses {
  margin-top: 1rem;
  font-weight: bold;
}
</style>