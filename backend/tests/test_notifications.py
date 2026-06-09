import datetime
from bson import ObjectId
from database import db


class TestNotifications:
    def test_get_notifications_empty(self, client, auth_headers):
        headers = auth_headers('Notif User', 'notif@bidflow.com', 'Notif1234!')
        res = client.get('/api/notifications/', headers=headers)
        assert res.status_code == 200
        assert res.get_json() == []

    def test_get_notifications_returns_data(self, client, auth_headers):
        headers = auth_headers('Notif User 2', 'notif2@bidflow.com', 'Notif1234!')
        user = db.Users.find_one({'email': 'notif2@bidflow.com'})
        user_id = str(user['_id'])
        db.Notifications.insert_one({
            'userId': user_id,
            'title': 'Test Notification',
            'message': 'This is a test',
            'type': 'system',
            'isRead': False,
            'createdAt': datetime.datetime.now(datetime.UTC)
        })
        res = client.get('/api/notifications/', headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['title'] == 'Test Notification'

    def test_mark_read(self, client, auth_headers):
        headers = auth_headers('Notif User 3', 'notif3@bidflow.com', 'Notif1234!')
        user = db.Users.find_one({'email': 'notif3@bidflow.com'})
        user_id = str(user['_id'])
        notif_id = db.Notifications.insert_one({
            'userId': user_id,
            'title': 'Read Me',
            'message': 'Mark as read',
            'type': 'system',
            'isRead': False,
            'createdAt': datetime.datetime.now(datetime.UTC)
        }).inserted_id
        res = client.post(f'/api/notifications/{notif_id}/read', headers=headers)
        assert res.status_code == 200
        assert res.get_json()['msg'] == 'Marked as read'
        notif = db.Notifications.find_one({'_id': notif_id})
        assert notif['isRead'] is True

    def test_mark_all_read(self, client, auth_headers):
        headers = auth_headers('Notif User 5', 'notif5@bidflow.com', 'Notif1234!')
        user = db.Users.find_one({'email': 'notif5@bidflow.com'})
        user_id = str(user['_id'])
        for i in range(3):
            db.Notifications.insert_one({
                'userId': user_id,
                'title': f'Notification {i}',
                'message': f'Message {i}',
                'type': 'system',
                'isRead': False,
                'createdAt': datetime.datetime.now(datetime.UTC)
            })
        res = client.post('/api/notifications/read-all', headers=headers)
        assert res.status_code == 200
        assert 'All notifications marked as read' in res.get_json()['msg']
        unread = db.Notifications.count_documents({'userId': user_id, 'isRead': False})
        assert unread == 0
