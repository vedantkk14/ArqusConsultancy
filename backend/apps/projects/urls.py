from rest_framework.routers import SimpleRouter

from .views import ExpenseViewSet, ProjectViewSet

router = SimpleRouter(trailing_slash=False)
router.register("projects", ProjectViewSet, basename="projects")
router.register("expenses", ExpenseViewSet, basename="expenses")

urlpatterns = router.urls
