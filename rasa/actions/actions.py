from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet
import requests
import logging

logger = logging.getLogger(__name__)

# StreaminDoDo API base URL (should be configurable)
API_BASE_URL = \"http://obs-multistream:3000/api\"

class ActionGetStreamStatus(Action):
    \"\"\"Get current streaming status\"\"\"
    
    def name(self) -> Text:
        return \"action_get_stream_status\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        try:
            # Get stream status from the main API
            response = requests.get(f\"{API_BASE_URL}/streams\", timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                streams = data.get('data', [])
                
                if streams:
                    active_count = len([s for s in streams if s.get('status') == 'active'])
                    message = f\"🔴 Currently streaming live! {active_count} active stream(s) across multiple platforms.\"
                else:
                    message = \"📺 No active streams at the moment. Check back later!\"
            else:
                message = \"⚠️ Unable to check stream status right now. Please try again later.\"
                
        except Exception as e:
            logger.error(f\"Error getting stream status: {e}\")
            message = \"❌ Error checking stream status. The streaming service might be unavailable.\"
        
        dispatcher.utter_message(text=message)
        return []

class ActionGetPlatformInfo(Action):
    \"\"\"Get platform-specific information\"\"\"
    
    def name(self) -> Text:
        return \"action_get_platform_info\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        try:
            # Get platform status from social media API
            response = requests.get(f\"{API_BASE_URL}/social/platforms\", timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                platforms = data.get('data', {})
                
                connected_platforms = []
                for platform, info in platforms.items():
                    if info.get('isConnected'):
                        status = \"🟢 Live\" if info.get('isStreaming') else \"💬 Chat Only\"
                        connected_platforms.append(f\"{platform.title()}: {status}\")
                
                if connected_platforms:
                    message = f\"🌐 Platform Status:\n\" + \"\n\".join(connected_platforms)
                else:
                    message = \"📱 No platforms currently connected.\"
            else:
                message = \"⚠️ Unable to check platform status right now.\"
                
        except Exception as e:
            logger.error(f\"Error getting platform info: {e}\")
            message = \"❌ Error checking platform information.\"
        
        dispatcher.utter_message(text=message)
        return []

class ActionGetViewerCount(Action):
    \"\"\"Get current viewer count across platforms\"\"\"
    
    def name(self) -> Text:
        return \"action_get_viewer_count\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        # Note: This would require implementation of viewer tracking
        # For now, return a placeholder message
        message = \"👥 Viewer count tracking is being implemented. Stay tuned!\"
        dispatcher.utter_message(text=message)
        return []

class ActionHandleTechnicalIssue(Action):
    \"\"\"Handle technical support requests\"\"\"
    
    def name(self) -> Text:
        return \"action_handle_technical_issue\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        # Get the latest user message to understand the issue
        latest_message = tracker.latest_message.get('text', '').lower()
        
        if 'lag' in latest_message or 'buffer' in latest_message:
            message = \"🔧 For buffering/lag issues:\n• Refresh the stream\n• Try a lower quality setting\n• Check your internet connection\n• Clear browser cache\"
        elif 'audio' in latest_message or 'sound' in latest_message:
            message = \"🔊 For audio issues:\n• Check your volume settings\n• Try refreshing the page\n• Ensure your browser allows audio\n• Try a different browser\"
        elif 'video' in latest_message:
            message = \"📺 For video issues:\n• Refresh the stream\n• Try a different quality setting\n• Check if hardware acceleration is enabled\n• Update your browser\"
        else:
            message = \"🛠️ General troubleshooting:\n• Refresh the page\n• Clear browser cache\n• Try a different browser\n• Check your internet connection\n\nIf issues persist, contact a moderator!\"
        
        dispatcher.utter_message(text=message)
        return []

class ActionGetSocialLinks(Action):
    \"\"\"Provide social media links\"\"\"
    
    def name(self) -> Text:
        return \"action_get_social_links\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        message = \"\"\"🌐 Follow us on all platforms:

🎮 Twitch: /streamindodo
📺 YouTube: /streamindodo
🐦 Twitter: @streamindodo
💬 Discord: discord.gg/streamindodo
📸 Instagram: @streamindodo
📱 TikTok: @streamindodo
💼 LinkedIn: /company/streamindodo
📢 Telegram: t.me/streamindodo

Thanks for your support! 💖\"\"\"
        
        dispatcher.utter_message(text=message)
        return []

class ActionGetStreamSchedule(Action):
    \"\"\"Provide streaming schedule information\"\"\"
    
    def name(self) -> Text:
        return \"action_get_stream_schedule\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        message = \"\"\"📅 Streaming Schedule:

🌅 Monday-Friday: 9 AM - 12 PM (UTC)
🌆 Saturday-Sunday: 2 PM - 6 PM (UTC)

🎯 Special events and announcements will be posted on all social media platforms!

⏰ Current time zone: UTC
📢 Follow us for schedule updates!\"\"\"
        
        dispatcher.utter_message(text=message)
        return []

class ActionLogUserInteraction(Action):
    \"\"\"Log user interaction for analytics\"\"\"
    
    def name(self) -> Text:
        return \"action_log_user_interaction\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        # Extract user info and interaction data
        user_id = tracker.sender_id
        latest_intent = tracker.latest_message.get('intent', {}).get('name')
        latest_message = tracker.latest_message.get('text', '')
        
        # Log the interaction (in a real implementation, this would go to a database)
        logger.info(f\"User interaction - ID: {user_id}, Intent: {latest_intent}, Message: {latest_message}\")
        
        # Set user activity slot
        return [SlotSet(\"last_interaction\", latest_intent)]

# Custom form action for feedback collection
class ActionCollectFeedback(Action):
    \"\"\"Collect user feedback\"\"\"
    
    def name(self) -> Text:
        return \"action_collect_feedback\"
    
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        message = \"\"\"📝 We'd love your feedback!

Please let us know:
• What you enjoy about the stream
• Any technical issues you've experienced
• Content suggestions
• Platform preferences

Just type your feedback and I'll make sure it gets to the team! 💬\"\"\"
        
        dispatcher.utter_message(text=message)
        return [SlotSet(\"collecting_feedback\", True)]