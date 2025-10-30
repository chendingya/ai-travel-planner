<template>
  <div class="auth-container">
    <h2>Login or Sign Up</h2>
    <form @submit.prevent="handleLogin">
      <div class="form-group">
        <label for="email">Email:</label>
        <input type="email" id="email" v-model="email" required>
      </div>
      <button type="submit">Send Magic Link</button>
    </form>
  </div>
</template>

<script>
import { supabase } from '../supabase';

export default {
  data() {
    return {
      email: '',
    };
  },
  methods: {
    async handleLogin() {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: this.email,
        });
        if (error) throw error;
        alert('Check your email for the login link!');
      } catch (error) {
        alert(error.error_description || error.message);
      }
    },
  },
};
</script>

<style scoped>
.auth-container {
  max-width: 400px;
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
input {
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
</style>