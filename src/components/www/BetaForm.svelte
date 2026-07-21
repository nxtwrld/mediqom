<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { apiFetch } from '$lib/api/client';
  
  interface FormData {
    user_type: string;
    problem_description: string;
    current_solution: string;
    data_volume: string;
    timeline: string;
    name: string;
    email: string;
    phone: string;
    organization: string;
    country: string;
    language: string;
    additional_info: string;
    beta_agreement: boolean;
    feedback_agreement: boolean;
    confidentiality_agreement: boolean;
    terms_agreement: boolean;
  }
  
  let formData: FormData = {
    user_type: '',
    problem_description: '',
    current_solution: '',
    data_volume: '',
    timeline: '',
    name: '',
    email: '',
    phone: '',
    organization: '',
    country: '',
    language: 'en',
    additional_info: '',
    beta_agreement: false,
    feedback_agreement: false,
    confidentiality_agreement: false,
    terms_agreement: false
  };
  
  let submitting = false;
  let submitStatus: 'idle' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let validationErrors: Record<string, string[]> = {};
  
  export let lang = 'en';
  
  // Set default language based on current language
  $: formData.language = lang;
  
  async function handleSubmit() {
    // Reset status
    submitStatus = 'idle';
    errorMessage = '';
    validationErrors = {};
    
    // Basic client-side validation
    if (!formData.user_type) {
      validationErrors.user_type = ['Please select a user type'];
      return;
    }
    
    if (!formData.problem_description || formData.problem_description.length < 10) {
      validationErrors.problem_description = ['Please provide more detail about your problem (at least 10 characters)'];
      return;
    }
    
    if (!formData.current_solution || formData.current_solution.length < 10) {
      validationErrors.current_solution = ['Please provide more detail about your current solution (at least 10 characters)'];
      return;
    }
    
    if (!formData.data_volume) {
      validationErrors.data_volume = ['Please select a data volume'];
      return;
    }
    
    if (!formData.timeline) {
      validationErrors.timeline = ['Please select a timeline'];
      return;
    }
    
    if (!formData.name || formData.name.length < 2) {
      validationErrors.name = ['Name is required'];
      return;
    }
    
    if (!formData.email || !formData.email.includes('@')) {
      validationErrors.email = ['Valid email is required'];
      return;
    }
    
    if (!formData.country) {
      validationErrors.country = ['Please select a country'];
      return;
    }
    
    if (!formData.beta_agreement || !formData.feedback_agreement || 
        !formData.confidentiality_agreement || !formData.terms_agreement) {
      errorMessage = 'Please agree to all terms and conditions';
      return;
    }
    
    submitting = true;
    
    try {
      const response = await apiFetch('/v1/beta/apply', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        submitStatus = 'success';
        // Reset form
        formData = {
          user_type: '',
          problem_description: '',
          current_solution: '',
          data_volume: '',
          timeline: '',
          name: '',
          email: '',
          phone: '',
          organization: '',
          country: '',
          language: lang,
          additional_info: '',
          beta_agreement: false,
          feedback_agreement: false,
          confidentiality_agreement: false,
          terms_agreement: false
        };
      } else {
        submitStatus = 'error';
        if (result.details?.fieldErrors) {
          validationErrors = result.details.fieldErrors;
        }
        errorMessage = result.error || 'Failed to submit application';
      }
    } catch (error) {
      submitStatus = 'error';
      errorMessage = 'Network error. Please try again later.';
      console.error('Error submitting beta application:', error);
    } finally {
      submitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="beta-form">
  {#if submitStatus === 'success'}
    <div class="success-message">
      <h3>🎉 Application Submitted Successfully!</h3>
      <p>Thank you for your interest in Mediqom. We'll review your application and get back to you within 48 hours.</p>
      <p>Check your email for confirmation and next steps.</p>
    </div>
  {:else}
    <!-- User Type -->
    <div class="form-group">
      <label for="user_type" class="required">I am a:</label>
      <div class="radio-group">
        <label>
          <input type="radio" bind:group={formData.user_type} value="family" />
          Family/Individual
        </label>
        <label>
          <input type="radio" bind:group={formData.user_type} value="provider" />
          Healthcare Provider
        </label>
        <label>
          <input type="radio" bind:group={formData.user_type} value="developer" />
          Developer/AI Company
        </label>
        <label>
          <input type="radio" bind:group={formData.user_type} value="organization" />
          Healthcare Organization
        </label>
      </div>
      {#if validationErrors.user_type}
        <span class="error">{validationErrors.user_type[0]}</span>
      {/if}
    </div>
    
    <!-- Problem Description -->
    <div class="form-group">
      <label for="problem_description" class="required">
        What problem are you trying to solve?
      </label>
      <p class="help-text">
        Example: "I have medical records from 3 countries in different languages and can never find what I need during doctor visits"
      </p>
      <textarea
        id="problem_description"
        bind:value={formData.problem_description}
        rows="4"
        required
      ></textarea>
      {#if validationErrors.problem_description}
        <span class="error">{validationErrors.problem_description[0]}</span>
      {/if}
    </div>
    
    <!-- Current Solution -->
    <div class="form-group">
      <label for="current_solution" class="required">
        What are you using now and why isn't it working?
      </label>
      <p class="help-text">
        Example: "Paper files and random PDFs on my computer. It's chaos and I've lost important documents"
      </p>
      <textarea
        id="current_solution"
        bind:value={formData.current_solution}
        rows="4"
        required
      ></textarea>
      {#if validationErrors.current_solution}
        <span class="error">{validationErrors.current_solution[0]}</span>
      {/if}
    </div>
    
    <!-- Data Volume -->
    <div class="form-group">
      <label for="data_volume" class="required">
        How many records/patients would you start with?
      </label>
      <div class="radio-group">
        <label>
          <input type="radio" bind:group={formData.data_volume} value="1-10" />
          1-10 documents/patients
        </label>
        <label>
          <input type="radio" bind:group={formData.data_volume} value="11-50" />
          11-50 documents/patients
        </label>
        <label>
          <input type="radio" bind:group={formData.data_volume} value="51-200" />
          51-200 documents/patients
        </label>
        <label>
          <input type="radio" bind:group={formData.data_volume} value="200+" />
          200+ documents/patients
        </label>
      </div>
      {#if validationErrors.data_volume}
        <span class="error">{validationErrors.data_volume[0]}</span>
      {/if}
    </div>
    
    <!-- Timeline -->
    <div class="form-group">
      <label for="timeline" class="required">
        When would you like to begin testing?
      </label>
      <div class="radio-group">
        <label>
          <input type="radio" bind:group={formData.timeline} value="immediately" />
          Immediately
        </label>
        <label>
          <input type="radio" bind:group={formData.timeline} value="week" />
          Within 1 week
        </label>
        <label>
          <input type="radio" bind:group={formData.timeline} value="month" />
          Within 1 month
        </label>
        <label>
          <input type="radio" bind:group={formData.timeline} value="exploring" />
          Just exploring
        </label>
      </div>
      {#if validationErrors.timeline}
        <span class="error">{validationErrors.timeline[0]}</span>
      {/if}
    </div>
    
    <!-- Contact Information -->
    <h3>Contact Information</h3>
    
    <div class="form-group">
      <label for="name" class="required">Name</label>
      <input
        type="text"
        id="name"
        bind:value={formData.name}
        required
      />
      {#if validationErrors.name}
        <span class="error">{validationErrors.name[0]}</span>
      {/if}
    </div>
    
    <div class="form-group">
      <label for="email" class="required">Email</label>
      <input
        type="email"
        id="email"
        bind:value={formData.email}
        required
      />
      {#if validationErrors.email}
        <span class="error">{validationErrors.email[0]}</span>
      {/if}
    </div>
    
    <div class="form-group">
      <label for="phone">Phone (Optional)</label>
      <input
        type="tel"
        id="phone"
        bind:value={formData.phone}
      />
    </div>
    
    <div class="form-group">
      <label for="organization">Organization (Optional)</label>
      <input
        type="text"
        id="organization"
        bind:value={formData.organization}
      />
    </div>
    
    <div class="form-group">
      <label for="country" class="required">Country</label>
      <select id="country" bind:value={formData.country} required>
        <option value="">Select a country</option>
        <option value="CZ">Czech Republic</option>
        <option value="DE">Germany</option>
        <option value="US">United States</option>
      </select>
      {#if validationErrors.country}
        <span class="error">{validationErrors.country[0]}</span>
      {/if}
    </div>
    
    <div class="form-group">
      <label for="language" class="required">Preferred Language</label>
      <select id="language" bind:value={formData.language} required>
        <option value="en">English</option>
        <option value="cs">Čeština</option>
        <option value="de">Deutsch</option>
      </select>
    </div>
    
    <!-- Additional Information -->
    <div class="form-group">
      <label for="additional_info">
        Anything else we should know?
      </label>
      <p class="help-text">
        Special requirements, specific features you need, etc.
      </p>
      <textarea
        id="additional_info"
        bind:value={formData.additional_info}
        rows="3"
      ></textarea>
    </div>
    
    <!-- Agreements -->
    <h3>Beta Agreement</h3>
    
    <div class="checkbox-group">
      <label>
        <input
          type="checkbox"
          bind:checked={formData.beta_agreement}
          required
        />
        I understand this is beta software and may have bugs
      </label>
      
      <label>
        <input
          type="checkbox"
          bind:checked={formData.feedback_agreement}
          required
        />
        I agree to provide feedback at least once per month
      </label>
      
      <label>
        <input
          type="checkbox"
          bind:checked={formData.confidentiality_agreement}
          required
        />
        I agree to keep beta features confidential
      </label>
      
      <label>
        <input
          type="checkbox"
          bind:checked={formData.terms_agreement}
          required
        />
        I agree to the <a href="/www/{lang}/terms" target="_blank">Terms of Service</a> 
        and <a href="/www/{lang}/privacy" target="_blank">Privacy Policy</a>
      </label>
    </div>
    
    {#if errorMessage}
      <div class="error-message">
        {errorMessage}
      </div>
    {/if}
    
    <button
      type="submit"
      class="submit-button"
      disabled={submitting}
    >
      {submitting ? 'Submitting...' : 'Submit Application'}
    </button>
  {/if}
</form>

<style>
  .beta-form {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
    background: var(--color-surface, #ffffff);
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--color-text-primary, #333);
  }
  
  label.required::after {
    content: ' *';
    color: var(--color-negative, #dc3545);
  }
  
  .help-text {
    font-size: 0.875rem;
    color: var(--color-text-secondary, #666);
    margin-bottom: 0.5rem;
    font-style: italic;
  }
  
  input[type="text"],
  input[type="email"],
  input[type="tel"],
  select,
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;
  }
  
  textarea {
    resize: vertical;
  }
  
  .radio-group,
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .radio-group label,
  .checkbox-group label {
    display: flex;
    align-items: center;
    font-weight: normal;
    cursor: pointer;
  }
  
  .radio-group input,
  .checkbox-group input {
    margin-right: 0.5rem;
  }
  
  h3 {
    margin-top: 2rem;
    margin-bottom: 1rem;
    color: var(--color-text-primary, #333);
  }
  
  .error {
    display: block;
    color: var(--color-negative, #dc3545);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  
  .error-message {
    background-color: #f8d7da;
    color: #721c24;
    padding: 0.75rem 1.25rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .success-message {
    background-color: #d4edda;
    color: #155724;
    padding: 1.5rem;
    border-radius: 4px;
    text-align: center;
  }
  
  .success-message h3 {
    margin-top: 0;
  }
  
  .submit-button {
    width: 100%;
    padding: 0.75rem 1.5rem;
    background-color: var(--color-interactivity, #007bff);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1.125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .submit-button:hover:not(:disabled) {
    background-color: var(--color-interactivity-dark, #0056b3);
  }
  
  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  a {
    color: var(--color-interactivity, #007bff);
    text-decoration: none;
  }
  
  a:hover {
    text-decoration: underline;
  }
  
  @media (max-width: 768px) {
    .beta-form {
      padding: 1rem;
      margin: 1rem;
    }
  }
</style>