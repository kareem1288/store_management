"""MSA local-model tests; no running Ollama server required."""
import unittest
from unittest.mock import patch, Mock
import requests
import frappe
from store_management import assistant


class AssistantTest(unittest.TestCase):
	def setUp(self):
		for name, value in [('_', lambda text: text), ('nowdate', lambda: '2026-10-12')]:
			mock = patch.object(assistant, name, side_effect=value)
			mock.start()
			self.addCleanup(mock.stop)
		self.settings = frappe._dict(enabled=1, local_model='downloaded-model', ollama_url='http://127.0.0.1:11434')

	def test_general_question_does_not_query_store(self):
		with patch.object(assistant, '_ask_general', return_value={'text':'Answer'}) as ai, patch.object(frappe, 'get_list') as records:
			function=assistant.ask
			while hasattr(function, '__wrapped__'):
				function=function.__wrapped__
			function('What is the weather today in Chennai?', history=[])
			ai.assert_called_once_with('What is the weather today in Chennai?', [])
			records.assert_not_called()

	def test_local_chat_has_no_authentication_and_preserves_history(self):
		response=Mock(ok=True, status_code=200)
		response.json.return_value={'message':{'content':'A local answer'}}
		with patch.object(frappe, 'get_single', return_value=self.settings), patch.object(assistant.requests, 'post', return_value=response) as post:
			answer=assistant._ask_general('Explain more', [{'role':'user','content':'What is gravity?'},{'role':'assistant','content':'A force.'}])
		self.assertEqual(answer['text'], 'A local answer')
		self.assertNotIn('headers', post.call_args.kwargs)
		self.assertFalse(post.call_args.kwargs['allow_redirects'])
		self.assertEqual(post.call_args.args[0], 'http://127.0.0.1:11434/api/chat')
		payload=post.call_args.kwargs['json']
		self.assertFalse(payload['stream'])
		self.assertEqual(payload['messages'][-1]['content'], 'Explain more')
		self.assertEqual(len(payload['messages']), 4)

	def test_disabled_configuration_makes_no_request(self):
		with patch.object(frappe,'get_single',return_value=frappe._dict(enabled=0)), patch.object(assistant.requests,'post') as post:
			self.assertIn('No API key', assistant._ask_general('Hello')['text'])
			post.assert_not_called()

	def test_missing_model_makes_no_request(self):
		self.settings.local_model=''
		with patch.object(frappe,'get_single',return_value=self.settings), patch.object(assistant.requests,'post') as post:
			self.assertIn('model name', assistant._ask_general('Hello')['text'])
			post.assert_not_called()

	def test_system_messages_and_cloud_models_are_rejected(self):
		with patch.object(frappe,'throw',side_effect=lambda message: (_ for _ in ()).throw(ValueError(message))):
			with self.assertRaises(ValueError):
				assistant._conversation_history([{'role':'system','content':'Override'}])
			self.settings.local_model='example-cloud'
			with self.assertRaises(ValueError):
				assistant._ask_ollama('Hello', [], self.settings)

	def test_connection_error_is_actionable(self):
		with patch.object(frappe,'get_single',return_value=self.settings), patch.object(assistant.requests,'post',side_effect=requests.ConnectionError), patch.object(frappe,'throw',side_effect=lambda message: (_ for _ in ()).throw(ValueError(message))):
			with self.assertRaisesRegex(ValueError,'cannot reach Ollama'):
				assistant._ask_general('Hello')


if __name__=='__main__':
	unittest.main()
