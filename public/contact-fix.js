window.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('odmMatchForm');
  if (!form) return;
  var newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!newForm.reportValidity()) return;
    var d = new FormData(newForm);
    var data = {
      requestType: d.get('type_demande'),
      companyName: d.get('entreprise'),
      country: d.get('pays'),
      contactName: d.get('contact'),
      email: d.get('email'),
      sector: d.get('secteur'),
      collaboration: d.get('besoin'),
      message: d.get('message'),
      language: 'fr',
      consent: true
    };
    var feedback = document.getElementById('odmFeedback');
    feedback.textContent = 'Envoi en cours...';
    try {
      var response = await fetch('/api/contact', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      });
      var result = await response.json();
      if (response.ok) {
        feedback.textContent = result.message || 'Votre demande a ete envoyee avec succes.';
        newForm.reset();
      } else {
        feedback.textContent = result.error || 'Une erreur est survenue.';
      }
    } catch (error) {
      feedback.textContent = 'Erreur de connexion. Veuillez reessayer.';
    }
  });
});
